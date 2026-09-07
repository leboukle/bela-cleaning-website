# Customer Self-Service Booking Management (Milestone 6)

Companion to [`docs/booking-backend.md`](./booking-backend.md) (Sheets
persistence) and [`docs/payments.md`](./payments.md) (Milestone 5's payment
lifecycle, which this milestone builds directly on top of — the
cancellation-fee charge reuses the exact same off-session PaymentIntent
function, and capacity/scheduling reuse the exact same availability
service). **No credential or token values appear anywhere in this
document.**

Customers can cancel or reschedule their own appointment via a secure,
tokenized "Manage Booking" link, with no accounts or passwords. Service,
extras, property, and address changes remain BeLa-only (contact required).

## 1. Manage Booking token

- Minted once, at booking creation (`bookingService.ts`): a 256-bit random
  value (`crypto.randomBytes(32)`, base64url-encoded, `manageToken.ts`).
- Only its SHA-256 hex digest is ever persisted (**Manage Booking Token
  Hash** column) — the raw token exists only in the confirmation email and
  the customer's browser, never in the Sheet, never in server logs.
- Every read/write endpoint re-derives the hash from the incoming raw
  token and looks up the matching row; comparison uses
  `crypto.timingSafeEqual` (`manageTokenHashesMatch`), the same
  constant-time pattern `schedulerAuth.ts` already established for a
  different secret.
- No expiry field: the link stays valid indefinitely for *viewing* a
  booking (including a cancelled one). What the customer may *do* with it
  — cancel, reschedule, neither — is computed fresh from the booking's
  current state on every request, never cached or stored.
- A token only ever resolves the one booking it was minted for; there is
  no way to enumerate or guess another booking's token from it.

## 2. Routes

```
GET  /api/manage-booking/[token]              -> customer-safe booking view
POST /api/manage-booking/[token]/cancel       -> cancellation (free or late-fee)
POST /api/manage-booking/[token]/reschedule   -> { serviceDate, arrivalWindow }
```

All three: validate the token server-side on every call, never trust any
client-supplied timing/eligibility/amount claim, and return a generic
"invalid or expired" response for any unrecognized or malformed token —
indistinguishable from a token that never existed. `app/manage-booking/[token]/page.tsx`
(a server component) calls the same `getManageBookingView()` the GET route
uses, so there is exactly one token-resolution path for both the page and
the API.

## 3. Customer-safe view

[`manageBookingView.ts`](../lib/booking/server/manageBookingView.ts) builds
an explicit field whitelist — Booking ID, status, service date/arrival
window, address, cleaning type, estimated duration, total, extras,
frequency, and current cancel/reschedule eligibility. It **never** exposes
Stripe Customer/PaymentMethod/SetupIntent/PaymentIntent IDs, internal
notification status, internal notes, or any other operational-only field —
enforced by construction (the view type simply has no such fields), not by
redaction.

## 4. The 24-hour rule

One rule, computed server-side only, in
[`cancellationPolicy.ts`](../lib/booking/server/cancellationPolicy.ts):

```
millisecondsUntilStart <= 24 hours  -> late (fee / self-reschedule disabled)
millisecondsUntilStart >  24 hours  -> free (no fee / self-reschedule allowed)
```

Uses the business's configured timezone (`America/New_York`) and the same
DST-safe wall-clock-to-UTC conversion Milestone 5 established for
Scheduled Charge At — extracted to a shared
[`timezone.ts`](../lib/booking/server/timezone.ts) /
[`serviceTime.ts`](../lib/booking/server/serviceTime.ts) so both modules
call the identical conversion rather than maintaining two copies. Exactly
24 hours out counts as late (inclusive on the late side), per spec.

## 5. Cancellation flow

[`cancellationService.ts`](../lib/booking/server/cancellationService.ts),
entry point `cancelBookingByToken()`. **Free** (>24h): marks Booking
Status `Cancelled`, Payment Status `Cancelled — No Charge`, no Stripe
interaction. **Late** (<=24h): marks `Cancelled` + Payment Status
`Cancellation Fee Processing` (with the computed fee amount) **before**
any Stripe call — this ordering, not any later step, is what makes the
process safe to crash at any point (see §7). Only then does it submit a
50%-of-Charge-Amount off-session PaymentIntent, reusing
`createOffSessionPaymentIntent()` unchanged from Milestone 5, tagged
`metadata.type = "cancellation_fee"` so the webhook can route it correctly
(§8). The fee percentage is never read from the client — computed
server-side from the booking's own Charge Amount.

Both `processDueBooking()` and `apps-script/paymentScheduler.gs` already
unconditionally skip any Booking Status = `Cancelled` row (a Milestone 5
guard, unmodified) — so a cancelled booking becoming ineligible for its
normal post-cleaning charge required **no new code**, only that
cancellation correctly writes `Cancelled` first.

Capacity release requires **no dedicated logic** either:
`getActiveBookingCountsByDate()` (`availability.ts`) counts live bookings
by scanning current Service Date + Booking Status on every read — marking
a row `Cancelled` *is* the capacity release.

## 6. Rescheduling flow

[`reschedulingService.ts`](../lib/booking/server/reschedulingService.ts),
entry point `rescheduleBookingByToken()`. Only eligible when >24h out and
still pre-charge (Payment Status `Scheduled`). Validates the new date the
same way a new booking is validated — `isValidDateKey`/
`isPastOrWithinLeadWindow` (`dateUtils.ts`) for lead time, then
`checkDateAvailability()` (`availability.ts`), the exact same function
`/api/booking` uses — **no second availability implementation**. Rechecks
availability immediately before writing (mirroring
`bookingService.ts`'s own "recheck right before append" pattern), so an
unavailable new slot always leaves the existing booking completely
untouched; the old slot is never released before the new one is confirmed
available. On success: overwrites Service Date/Arrival Window (which is
also the old-slot-release/new-slot-reservation operation, per the capacity
model above), recalculates Scheduled Charge At, and records **Original
Service Date**/**Original Arrival Window** — but only on the *first*
reschedule ever (a blank `originalServiceDate` is the signal); a second or
later reschedule leaves those two columns untouched, so they always
reflect the true original appointment regardless of how many times it's
since moved.

## 7. Crash-recoverable late-cancellation fee

`cancelBookingByToken()` is designed to be fully idempotent and resumable:
every call re-reads the booking's current authoritative state and does
only whatever the next needed step is — including "nothing, already
done." This is what makes recovery fall out of the same code path as a
fresh cancellation, with no separate "recovery mode":

- If the process crashes after writing `Cancelled` + `Cancellation Fee
  Processing` but *before* ever calling Stripe, the booking is left in a
  state fully distinguishable from every other state using only the
  existing **Payment Status** + **Stripe Payment Intent ID** fields (no
  new column): Cancelled, Processing, Stripe Payment Intent ID blank.
- The exported `resolveCancellationFeeState()` recognizes exactly this
  condition and submits the missing PaymentIntent — called both by a
  repeated `cancelBookingByToken()` call and, as a best-effort self-heal,
  by `manageBookingAccess.ts` every time the Manage Booking page itself is
  viewed (a recovery failure there never breaks the page render; it just
  falls through to showing the current state).
- The Stripe idempotency key is deterministic and stable across every
  attempt and every recovery: `cancel-fee:${bookingId}`. Stripe's own
  idempotency-key deduplication — not any application-side lock — is what
  actually prevents a duplicate charge no matter how many times recovery
  runs.
- If Stripe never returns a PaymentIntent at all (infra/connectivity
  failure, not a card decline), no webhook will ever arrive for that
  attempt — `resolveMissingPaymentIntent()` resolves it directly to
  `Cancellation Fee Failed` and notifies BeLa, the same exception
  `paymentProcessingService.ts` already established in Milestone 5 for the
  normal charge. **The booking stays Cancelled regardless** — nothing in
  this module ever reverts Booking Status once cancellation has been
  recorded.

## 8. Payment Status extension (same column, 4 new values)

No new status column — `PAYMENT_STATUS` (`bookingsSheetSchema.ts`) gains
four values on the existing field, the same column Milestone 5 already
established as the single "what happened with this booking's one payment
event" field:

```
Cancelled — No Charge        (free cancellation's terminal state)
Cancellation Fee Processing  (late-fee PaymentIntent submitted, awaiting webhook)
Cancellation Fee Paid        (webhook confirmed success)
Cancellation Fee Failed      (webhook confirmed decline, or no PI was ever created)
```

**Stripe Payment Intent ID** and **Paid At** are reused (not duplicated)
for the cancellation fee: a booking can only ever be cancelled *before*
its normal charge could possibly be attempted (the normal charge only
fires after the appointment), so both columns are provably blank at
cancellation time — the adjacent Payment Status value always disambiguates
which kind of payment event a human reader is looking at. **Charge
Amount** is *not* reused (a dedicated **Cancellation Fee Amount** column
instead) — Charge Amount already has an established, different meaning
(the normal cleaning price, staff-editable) that reuse would confusingly
overload.

The webhook (`paymentWebhookService.ts`) branches on
`metadata.type === "cancellation_fee"` to route to dedicated cancellation-
fee handlers instead of the normal-charge ones; both are single-shot and
idempotent (only act while still `Cancellation Fee Processing`).

## 9. Sheet columns (5 new)

Appended to the end of `BOOKINGS_COLUMNS` — no existing column reordered,
matching every prior milestone's precedent. The sheet contract is now 61
columns total (41 M3 + 3 M4 + 12 M5 + 5 here).

| Column | Set by | Notes |
|---|---|---|
| Manage Booking Token Hash | booking submission | SHA-256 hex digest only — the raw token is never written here |
| Cancellation Fee Amount | cancellation (late path only) | Dollars; 50% of Charge Amount at cancellation time |
| Rescheduled At | reschedule | Timestamp of the most recent reschedule |
| Original Service Date | first reschedule only | Populated once, never overwritten by later reschedules |
| Original Arrival Window | first reschedule only | Populated once, never overwritten by later reschedules |

## 10. Notifications

Extends `NotificationService` (`notificationService.ts`) with 6 new
methods, matching the constructor-injected-transport pattern from prior
milestones. Customer-facing: free cancellation confirmation, late
cancellation confirmation (fee amount, "will be charged" — never "has been
charged," since the webhook hasn't resolved yet at send time), and
reschedule confirmation (old + new date/window). Internal: cancellation
notification (free/late), and cancellation-fee-payment-failure notification.
The booking-confirmation email (`customerBookingReceived.ts`) now includes
the Manage Booking link and the precise 50%-fee policy sentence, replacing
the prior milestone's vaguer "per the Service Policy" wording. No Stripe
internal ID is ever included in a customer-facing email.

## 11. What this milestone explicitly does not build

Customer accounts/passwords, an admin or cleaner portal, self-service
edits to cleaning type/extras/property/address, a full refund system,
loyalty credits, promo-code changes, recurring-booking modification, a
cancellation-fee-waiver UI, or a new payment provider. The Google Sheet
remains the sole operational record.
