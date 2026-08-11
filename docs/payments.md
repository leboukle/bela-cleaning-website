# Booking Payment Lifecycle (Milestone 5)

Companion to [`docs/booking-backend.md`](./booking-backend.md) (Sheets
persistence) and [`docs/notifications.md`](./notifications.md) (the two
Milestone 4 emails, extended here with three more). This document covers
the full booking-to-payment lifecycle: collecting a card at booking time
without charging it, scheduling an automatic charge, running that charge
without any human in the loop, and the retry/failure model. **No
credential values appear anywhere in this document — names only.**

Everything here runs in **Stripe test mode only**. Activating live mode is
an explicit future decision, not part of this milestone.

## 1. Why this exists

BeLa's booking flow previously ended with "Pending Payment" and no actual
payment mechanism — a human had to collect payment separately. This
milestone lets BeLa replace that for normal new bookings: the customer
saves a card at booking time (never charged then), consents clearly to a
future automatic charge, and that charge happens on its own, on schedule,
whether or not anyone opens the Sheet, Vercel, or Stripe that day.

Cancellations and rescheduling are explicitly **not** built this
milestone — see §8 for how the architecture stays ready for them anyway.

## 2. Architecture

```
Booking UI (PaymentStep.tsx)
  -> POST /api/payments/setup-intent          (creates Stripe Customer + SetupIntent)
  -> Stripe Elements collects the card directly (BeLa/Vercel code never sees it)
  -> stripe.confirmSetup() client-side          (confirms the SetupIntent)
  -> POST /api/booking, now carrying the confirmed setupIntentId
       -> bookingService.submitBooking() re-verifies the SetupIntent against
          Stripe directly (never trusts the browser's claim)
       -> computes Scheduled Charge At (server-side, DST-safe)
       -> persists the booking, Payment Status = "Scheduled"

Google Apps Script (15-minute trigger, apps-script/paymentScheduler.gs)
  -> scans the Bookings sheet directly for due rows
  -> POST /api/payments/process-due  { bookingIds: [...] }
       -> re-reads each booking's authoritative state independently
       -> creates + confirms an off-session Stripe PaymentIntent (idempotent)
       -> marks Payment Status = "Processing"; leaves final status to the webhook

Stripe
  -> payment_intent.succeeded / payment_intent.payment_failed
  -> POST /api/payments/webhook (signature-verified, authoritative)
       -> resolves final Payment Status (Paid / Retry Scheduled / Final
          Failure / Requires Action) and sends the matching notification
```

**Responsibility split**, matching what was approved before implementation:

- Apps Script only ever determines *which* bookings look due and calls the
  protected endpoint. It never talks to Stripe and never stores a Stripe
  secret key (see `apps-script/README.md`).
- The Vercel server authenticates the scheduler, re-validates everything,
  creates the PaymentIntent, and never exposes the Stripe secret key to
  anything outside `lib/booking/server/stripe/`.
- The Stripe webhook is the **authoritative** source for whether a charge
  actually succeeded or failed — see §6 for exactly why and the one
  documented exception.

## 3. Two-phase booking submission

1. **Payment step** (`components/booking/steps/PaymentStep.tsx`): calls
   `POST /api/payments/setup-intent` with the customer's name/email/phone
   only. The server ([`stripe/setupIntent.ts`](../lib/booking/server/stripe/setupIntent.ts))
   creates a fresh Stripe Customer (always fresh — no customer accounts
   this milestone, so there's no safe reuse key beyond email, which isn't
   unique enough) and a SetupIntent (`usage: "off_session"`, so Stripe
   performs authentication checks now, while the customer is present,
   maximizing the odds the later off-session charge won't need it again).
   Stripe Elements (`PaymentElement`) collects the card directly into
   Stripe's iframe; the client then calls `stripe.confirmSetup()`.
2. **Final submission** (`POST /api/booking`, unchanged endpoint):
   now carries the confirmed `setupIntentId`. `bookingService.ts`
   independently calls `verifySucceededSetupIntent()` — requires
   `status === "succeeded"` and a real Customer + PaymentMethod attached —
   before persisting anything. A forged or stale ID fails with
   `payment-setup-invalid`, and the Review screen offers "Update payment
   method" to redo the Payment step.

No card number, CVC, or full expiration ever reaches BeLa/Vercel code or
the Sheet at any point in this flow — Stripe Elements collects it directly
into Stripe's own iframe.

## 4. Scheduled Charge At

Computed server-side only, in
[`scheduledCharge.ts`](../lib/booking/server/scheduledCharge.ts):

```
Scheduled Charge At = arrival-window start time + estimated duration + 1 hour
```

in the business's configured timezone (`Settings.timezone`, currently
`America/New_York` — the same single source of truth `bookingService.ts`
already used for date-availability checks, not a second hardcoded value).
Uses a DST-safe wall-clock-to-UTC conversion (a two-pass
`Intl.DateTimeFormat` convergence, since JavaScript has no built-in
zoned-to-UTC conversion) so the charge time is correct across a DST
transition, not just correct in the common case. This is fixed at booking
time from the *estimated* duration — it never moves if the actual visit
runs long or short.

## 5. Sheet columns (12 new, 3 reused)

Appended to the end of `BOOKINGS_COLUMNS`
([`bookingsSheetSchema.ts`](../lib/booking/server/bookingsSheetSchema.ts)) —
no existing column reordered, matching the Milestone 3/4 precedent. The
sheet contract is now 56 columns total (41 Milestone 3 + 3 Milestone 4 +
12 here).

| Column | Set by | Notes |
|---|---|---|
| Stripe Customer ID | booking submission | |
| Stripe PaymentMethod ID | booking submission | |
| Stripe SetupIntent ID | booking submission | |
| Scheduled Charge At | booking submission | ISO 8601 UTC; see §4 |
| Original Booking Total | booking submission | Never changes after booking |
| Charge Amount | booking submission, editable by BeLa staff | Authoritative charge figure; defaults to Original Booking Total |
| Payment Attempt Count | payment processing | Starts at 0 |
| Last Payment Attempt At | payment processing | |
| Next Payment Attempt At | payment processing | Blank unless Payment Status = Retry Scheduled |
| Payment Failure Code | payment processing | Stripe's `code`/`type`, for staff visibility |
| Manual Amount Override | BeLa staff (boolean) | `TRUE`/`FALSE` checkbox cell — not a timestamp |
| Manual Amount Override At | BeLa staff | Paired timestamp for the boolean above |

Two existing Milestone 3 columns are **reused as-is**, not duplicated:
**Payment Status** (column D — now carries the richer value set in §7
instead of only `"Unpaid"`) and **Stripe Payment Intent ID** / **Paid At**
(filled in once a charge succeeds).

**Stripe Checkout Session ID** (a Milestone 3-era placeholder) is kept in
place, permanently blank — it belongs to Stripe's Checkout Sessions
architecture, which this milestone doesn't use (SetupIntent + off-session
PaymentIntent instead). Removing or repurposing it was explicitly ruled
out to avoid touching an existing column's meaning.

To adjust an amount before it charges, BeLa staff edit **Charge Amount**
(and, for their own record-keeping, **Manual Amount Override** /
**Manual Amount Override At**) directly in the Sheet — no new admin UI
this milestone. If left untouched, **Original Booking Total** is what
charges automatically.

## 6. Payment status model

```
Scheduled -> Processing -> Paid
                        -> Retry Scheduled -> Processing -> ... (up to 4 attempts)
                        -> Requires Action
                        -> Final Failure
```

`Unpaid` remains for backward compatibility with rows written before this
milestone only — every new booking starts at `Scheduled`, never `Unpaid`.

**Requires Action** is the one addition beyond the five originally
proposed statuses — Stripe's `authentication_required` outcome doesn't
fit cleanly into "will retry automatically" (Retry Scheduled) or
"permanently failed" (Final Failure), so it gets its own status: BeLa is
notified, no further automatic attempts happen, and the architecture
leaves room for a future customer-facing "update your payment method" flow
to resolve it (not built this milestone).

**The Stripe webhook is the authoritative source for all of these
transitions**, with one documented exception:
`paymentProcessingService.ts`'s `processDueBooking()` only writes
`Processing` (plus attempt bookkeeping) before calling Stripe, and again
after — the second write records the PaymentIntent ID for visibility, but
never resolves Paid/Retry Scheduled/Final Failure/Requires Action itself,
**unless** Stripe never produced a PaymentIntent at all (a connectivity or
infra failure before/during the API call, not a card decline). In that one
case, no webhook will ever fire for the attempt, so `processDueBooking()`
resolves it directly and sends the internal failure notification itself.
Every other outcome — success, a real decline, requires-action — is
resolved exclusively by `paymentWebhookService.ts` once Stripe's webhook
arrives, matching the "authoritative" requirement.

Both `updatePaymentAttempt` writers and both webhook handlers are
idempotent: a redelivered webhook event, or an overlapping scheduler run,
is a safe no-op if the booking has already moved past the state that event
or attempt would have produced.

## 7. Retry cadence and failure classification

Approved cadence, counting the original attempt as attempt 1:

| Attempt | Timing |
|---|---|
| 1 | Scheduled Charge At |
| 2 | +6 hours |
| 3 | +24 hours |
| 4 | +72 hours |
| after 4 | Final Failure |

Implemented in [`paymentRetryCadence.ts`](../lib/booking/server/paymentRetryCadence.ts).
This cadence applies **only to retryable failures** — every failed attempt
is classified first, via
[`paymentFailureClassification.ts`](../lib/booking/server/stripe/paymentFailureClassification.ts),
against Stripe's real `type`/`code`/`decline_code` taxonomy:

| Classification | Examples | Result |
|---|---|---|
| `retryable` | `insufficient_funds`, `issuer_not_available`, `processing_error`, `try_again_later`, `card_velocity_exceeded`, `generic_decline`, `do_not_honor`, any `api_error`, and any unrecognized code (fails safe) | Retry Scheduled per the cadence above, until attempt 4 |
| `non-retryable` | `lost_card`, `stolen_card`, `fraudulent`, `expired_card`, `incorrect_cvc`, `incorrect_number`, `invalid_expiry_*`, any `invalid_request_error` | Final Failure immediately, no further attempts |
| `requires-action` | `authentication_required` | Requires Action, no automatic retry — see §6 |

**BeLa receives an internal notification on every failed payment attempt**,
regardless of classification (`sendInternalPaymentFailed`) — this is
separate from whether an automatic retry happens.

## 8. Cancellation-readiness (not built this milestone)

No cancellation or rescheduling flow exists yet. The architecture stays
ready for one:

- Payment Status is a distinct field from Booking Status — a future
  cancellation flow can set Booking Status to `Cancelled` without
  inventing a new payment field.
- Both `paymentProcessingService.ts` and `apps-script/paymentScheduler.gs`
  already skip any row where Booking Status is `Cancelled` before doing
  anything payment-related — a future cancellation feature only needs to
  set that one field to stop an unprocessed charge; no changes needed here.

## 9. Vercel configuration

### Stable Preview alias

Both the Stripe webhook and the Apps Script scheduler call a **stable
alias**, not a per-deployment URL — `vercel alias set <deployment-url>
bela-payments-preview.vercel.app`, re-run after every future deploy this
milestone touches. This never affects the Production custom domain.

### Vercel Protection Bypass for Automation — two different mechanisms

- **Stripe webhook**: the bypass secret is appended as the
  `x-vercel-protection-bypass` **query parameter** on the URL registered
  in the Stripe Dashboard, because Stripe cannot set custom headers on
  webhook delivery.
- **Apps Script scheduler**: the bypass secret is sent as the
  `x-vercel-protection-bypass` **HTTP header** via `UrlFetchApp`, because
  Apps Script *can* set headers — this keeps the secret out of the URL
  entirely (never logged, never visible in the script's own Executions
  history). Stored only in Apps Script's Script Properties, never in a
  spreadsheet cell. See `apps-script/README.md`.

These are two different secrets serving two different purposes: the
Vercel bypass only gets a request past Preview Deployment Protection; it
proves nothing about who is calling. Actual authentication is Stripe's
signature verification for the webhook, and the separate
`PAYMENT_SCHEDULER_SECRET` header (`schedulerAuth.ts`) for the scheduler.

### Environment variables

| Variable | Used by |
|---|---|
| `STRIPE_SECRET_KEY` | Server only — never exposed to the browser or Apps Script |
| `STRIPE_WEBHOOK_SECRET` | Verifies the webhook's signature |
| `PAYMENT_SCHEDULER_SECRET` | Authenticates Apps Script's calls to process-due |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Client — safe to expose, loads Stripe.js |

### Scheduler timing precision

The Apps Script trigger runs every 15 minutes, not continuously — a
booking's automatic charge actually fires at **the first scheduler run on
or after** its Scheduled Charge At / Next Payment Attempt At, not to the
exact minute. The underlying business rule (charge 1 hour after the
cleaning's scheduled end) doesn't change; this is a bounded, documented
scheduling latency of at most ~15 minutes.

## 10. Testing

Live testing (Stripe test mode, a real test booking) uses a manually
edited **Scheduled Charge At** cell on a clearly-labeled test booking, set
to a past timestamp, so the next real scheduler run picks it up —
deliberately **not** a test-only code path, per the standing instruction
that the production payment logic must be exercised exactly as it runs for
real bookings.

Automated coverage (30 scenarios) lives alongside each module as
`*.test.ts` — see `lib/booking/server/stripe/`, `paymentProcessingService.test.ts`,
`paymentWebhookService.test.ts`, and `scheduledCharge.test.ts`.
