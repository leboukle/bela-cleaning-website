# Booking Backend Architecture

This document covers the Google-Sheets-backed booking submission system built
on top of the `/booking-preview` client-side flow. It exists so a future
maintainer (human or AI) can understand the design without re-reading every
source file. It contains **no secret values** — only environment variable
*names*, sheet/tab names, and the data contract.

Scope: this system handles booking **submission, validation, pricing,
availability, and persistence to Google Sheets**. It does **not** handle
payment (Stripe), email/SMS notifications, customer accounts, or a cleaner
portal — those are explicitly out of scope for this milestone.

## 1. Why Google Sheets, and why keyless auth

The business already manages bookings in a spreadsheet ("BeLa Cleaning
Bookings"), so this milestone writes directly to that spreadsheet rather than
introducing a new database. No service-account JSON key, private key, or any
`NEXT_PUBLIC_GOOGLE_*` variable exists anywhere in this codebase — Google
credentials are obtained at request time via **Workload Identity
Federation (WIF)** and never touch client-side code:

```
Vercel OIDC token (per-request, short-lived)
  → exchanged with Google Security Token Service
  → impersonates a Google service account
  → short-lived Google access token
  → used once, for that request's Sheets API calls
```

This means there is no long-lived secret to rotate, leak, or store — only
configuration (project number, pool ID, provider ID, service account email)
that identifies *how* to obtain a token, not the token itself.

Implementation: [`lib/booking/server/googleAuth.ts`](../lib/booking/server/googleAuth.ts)
uses `google-auth-library`'s `IdentityPoolClient` with a
`subject_token_supplier` callback backed by `@vercel/oidc`'s
`getVercelOidcToken()`. This only works when actually running on Vercel
(Preview or Production) — there is no local-dev credential path, and none
should be added. Running the app locally will correctly fail closed with
`Missing required environment variable: GOOGLE_CLOUD_PROJECT_NUMBER` (or
similar) the moment any booking-backend code path executes.

### Required environment variables (names only)

Set in Vercel (Preview + Production), never committed to the repo:

- `GOOGLE_CLOUD_PROJECT_NUMBER`
- `GOOGLE_WORKLOAD_IDENTITY_POOL_ID`
- `GOOGLE_WORKLOAD_IDENTITY_PROVIDER_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SHEETS_SPREADSHEET_ID`

None of these are secrets in the traditional sense (they identify
configuration, not a credential), but none should ever be exposed to
client-side code (no `NEXT_PUBLIC_` prefix) or logged.

## 2. Request flow

```
Customer fills out /booking-preview (client-only React state)
  → Review step → POST /api/booking
      → rate limit check (best-effort, per-instance)
      → parse + size-bound the JSON body
      → bookingService.submitBooking()
          1. getBookingSettings()            (Settings tab, fail-closed, cached 60s)
          2. validateSubmission()             (re-validates everything server-side)
          3. idempotency fast path            (in-memory, then authoritative Sheets check)
          4. checkDateAvailability()          (Blackout Dates + Availability Overrides + live counts)
          5. calculateAuthoritativePricing()  (re-runs the approved pricing engine)
          6. generateBookingId() + collision check
          7. checkDateAvailability() again    (immediately before append — narrows the race window)
          8. repository.appendBooking()       (Google Sheets API, RAW value input)
      → typed JSON result → client renders success / validation / date-unavailable / server-error
```

`GET /api/booking/availability` follows a lighter path: it calls
`getUnavailableDateKeysInWindow()` directly (no validation/pricing needed)
and feeds the client-side `Calendar` component's disabled-date list. If this
endpoint is unreachable, the calendar **fails open** (all dates in range
appear selectable) with a visible warning — the authoritative check still
happens server-side at submission time, so this can never let an actually
unavailable date get booked.

## 3. Sheet contract

Spreadsheet: **"BeLa Cleaning Bookings"** (ID via `GOOGLE_SHEETS_SPREADSHEET_ID`).

### Bookings tab — 41 columns, exact order

Defined once in [`lib/booking/server/bookingsSheetSchema.ts`](../lib/booking/server/bookingsSheetSchema.ts)
as `BOOKINGS_COLUMNS`. Every module that reads or writes this sheet derives
its A1 ranges from that array via `columnLetter()` — **no file hardcodes a
column letter**. If the contract ever needs to change, that is the only file
to edit, and every consumer (repository writes, availability's capacity
count) picks up the new layout automatically.

```
Booking ID, Submitted At, Booking Status, Payment Status, First Name,
Last Name, Email, Mobile, Street Address, Apartment or Unit, City, State,
ZIP Code, Someone Home, Service Date, Arrival Window, Property Type,
Square Footage, Bedrooms, Bathrooms, Cleaning Type, Extras, Frequency,
Base Cleaning Price, Bathroom Price, Cleaning Type Price, Extras Price,
Subtotal, Frequency Discount, Total Price, Estimated Duration Minutes,
Special Instructions, Policy Accepted, Submission Source,
Stripe Checkout Session ID, Stripe Payment Intent ID, Paid At,
Cancelled At, Completed At, Internal Notes, Schema Version
```

The Stripe/Paid/Cancelled/Completed columns are written as empty strings
this milestone — reserved for the future payment-integration milestone so
the column contract doesn't need to change again then.

### Blackout Dates tab

`Date, Reason, Active, Internal Notes` — a date is a blackout when `Active`
is exactly `"TRUE"` (case-insensitive). Read by
[`availability.ts`](../lib/booking/server/availability.ts).

### Availability Overrides tab

`Date, Maximum Bookings, Reason, Active` — an active row replaces
`default_daily_capacity` for that one date (including `0` to fully close a
date without a blackout entry).

### Settings tab

`Setting, Value, Description`. Read by
[`settings.ts`](../lib/booking/server/settings.ts), cached in-memory for 60
seconds per warm instance. **Fails closed**: if a value is missing or
malformed, every dependent request throws rather than falling back to a
guessed default, because these values gate money and availability
correctness.

| Setting | Meaning |
|---|---|
| `minimum_lead_days` | Earliest a customer may book, in days from today |
| `default_daily_capacity` | Bookings allowed per date absent an override |
| `timezone` | IANA zone used to compute "today" for lead-time checks |
| `schema_version` | Written into every new booking row's Schema Version column |

## 4. Server-side validation

[`validateSubmission.ts`](../lib/booking/server/validateSubmission.ts) trusts
**nothing** from the client — every field is re-validated against the same
centralized config the UI itself is built from (`config.ts`,
`serviceArea.ts`, `schedule.ts`, `limits.ts`), so the rules can never drift
between client and server, but a manipulated request can never bypass them.
Notably:

- The **address ZIP** (not the earlier Location-step ZIP) is authoritative
  for service-area checks — it's the address actually being cleaned.
- Any bedroom/bathroom/square-footage option flagged `customEstimate` is
  rejected outright — those can never reach an instant-priced booking.
- A honeypot field failing validation returns the *same* generic error as
  any other validation failure, so a bot can't distinguish honeypot
  rejection from a normal mistake.

## 5. Pricing and duration

[`pricing.ts`](../lib/booking/server/pricing.ts) re-runs
[`lib/booking/calculate.ts`](../lib/booking/calculate.ts) — the single
pricing engine the client's live estimate also uses — from the validated
booking, completely ignoring whatever total the client displayed. A
`clientTotalPrice`/`clientDurationMinutes` pair is accepted on the wire for
future tamper-detection/logging use but is never trusted for the actual
charge or persisted value.

Money is rounded to integer cents at the moment of persistence
([`money.ts`](../lib/booking/server/money.ts)) — a second, independent pass
on top of `calculate.ts`'s own rounding, so a persisted value can never carry
silent floating-point drift. A defensive check in `pricing.ts` throws if
`Subtotal - Frequency Discount` and `Total Price` are ever inconsistent by
more than half a cent, which would only happen if `calculate.ts`'s formula
changed in a way this mapping no longer reflects.

## 6. Booking Status and Payment Status

Every new booking is written with:

- **Booking Status**: `Pending Payment`
- **Payment Status**: `Unpaid`

No status this milestone ever claims a booking is confirmed or paid — the
customer-facing success message says the request "has been received" and
that BeLa will follow up, never "your appointment is confirmed." Payment
integration (Stripe) is a future milestone; the Stripe column pair exists
now purely to avoid a future column-contract change.

Only `Cancelled` bookings are excluded from a date's active-booking count —
every other status, including the initial `Pending Payment`, consumes daily
capacity (see `bookingsSheetSchema.ts`'s `BOOKING_STATUS` comment).

## 7. Idempotency

Two layers, documented where they live:

1. **Best-effort, in-memory fast path** ([`idempotency.ts`](../lib/booking/server/idempotency.ts)) —
   only helps when two requests with the same client-generated
   idempotency token land on the same warm serverless instance. Only
   **successful** results are cached; a transient failure is never cached,
   so a legitimate retry after a momentary error isn't stuck replaying it.
   Concurrent same-token requests share one in-flight promise regardless of
   outcome, which is what actually matters for preventing a duplicate
   append from a double-click.
2. **Authoritative, cross-instance check**
   ([`googleSheetsRepository.ts`](../lib/booking/server/googleSheetsRepository.ts)'s
   `findRecentBookingByIdempotencyToken`) — scans the *Internal Notes*
   column (marker format `idempotency_token:<token>`) for a match, bounded
   to the most recent 500 rows scanned backward. No new hidden column was
   introduced for this; the existing Internal Notes column already had a
   sensible place for it.

The client (`BookingFlow.tsx`) generates one `crypto.randomUUID()` token per
booking session and reuses it for the life of that session, so repeat clicks
or a retry of the same attempt naturally dedupe.

### Known race-condition limitation

Availability is checked once when the customer opens Review-adjacent steps
and again immediately before the Sheets append (`bookingService.ts`), which
narrows but does not eliminate the window — two submissions for the last
slot on a date, arriving within milliseconds of each other on different
serverless instances, could both pass their respective "immediately before
append" check and both get written, exceeding capacity by one. Google Sheets
has no transactional row-locking primitive available here. This is an
accepted, documented limitation for this milestone (proportionate to a
business booking ~2 jobs/day); a future high-volume milestone would need a
real database with a unique constraint or a distributed lock to close it
completely.

## 8. Spam and abuse protection

- **Honeypot**: an invisible, unfocusable, `aria-hidden` text field
  (`ReviewStep.tsx`) that real customers never see or fill. A non-empty
  value is rejected as a normal validation failure.
- **Rate limiting** ([`rateLimit.ts`](../lib/booking/server/rateLimit.ts)):
  5 requests per 60 seconds per client key (`submit:<ip>` and
  `availability:<ip>` are tracked independently). Best-effort and
  per-instance only — no paid or external rate-limiting service was
  introduced, per the project's scope constraints.
- **Formula-injection defense**: every Sheets write uses
  `valueInputOption=RAW` (primary defense — the Sheets API documents this as
  storing values as literal text, never parsed as a formula), plus
  [`sanitize.ts`](../lib/booking/server/sanitize.ts) prefixing a leading
  apostrophe onto any customer text starting with `= + - @` (belt-and-
  suspenders, in case a future change ever touches the value-input mode).

## 9. Testing

`npm test` runs the Vitest suite (`lib/booking/server/*.test.ts`) — pure
unit and integration-style tests with the Google Sheets HTTP layer mocked
(`vi.mock("./sheetsClient")`) or an in-memory `BookingRepository` test
double, so tests never make a real network call. Notable coverage:
validation edge cases, availability/blackout/override logic, pricing
consistency, idempotency (including the "don't cache failures" fix),
booking ID collision handling, and the full `bookingService.submitBooking`
sequencing (happy path, validation failure, honeypot, date-unavailable,
authoritative dedupe, concurrent same-token requests, ID collision retry
and exhaustion, the pre-append recheck race, settings failure, append
failure).

`server-only` (a build-time guard preventing these modules from ever
reaching a client bundle) is aliased to its own no-op stub in
`vitest.config.ts`, since it otherwise throws outside Next.js's
`react-server` bundler condition — see that file's comment.

### What local `npm run dev` cannot test

There is no local credential path (by design — see §1), so any request that
reaches `googleAuth.ts` locally fails closed with a
`Missing required environment variable` error, surfaced to the customer as
the generic "We're temporarily unable to process bookings" message. This is
expected, not a bug — it was used during development to confirm the
error-handling path itself (sanitized server logs, graceful client UI,
preserved form data) end to end.

### Testing against a real Preview deployment

Exercising the real WIF auth path and writing an actual row to the "BeLa
Cleaning Bookings" spreadsheet requires an actual Preview deployment (`vercel
deploy`, never `--prod`) — this writes to the business's live spreadsheet
via real infrastructure and needs its own explicit go-ahead separate from
approval of the code itself, since it's a different kind of action (touching
real Google infrastructure) than reviewing a diff.

## 10. Future database migration boundary

Everything above the `BookingRepository` interface
([`repository.ts`](../lib/booking/server/repository.ts)) — validation,
pricing, availability, the orchestrator, the API routes, the UI — has no
knowledge that Google Sheets is the current storage. Swapping in a real
database later means writing one new class implementing `BookingRepository`
and changing a single wiring point (currently `new
GoogleSheetsBookingRepository()` in `app/api/booking/route.ts`); nothing
else in the booking domain needs to change.

## 11. Do not change without a new discussion

- The Bookings column contract (§3) — any reorder/insert/remove needs the
  business's sign-off, since it's a live spreadsheet other tooling may
  already reference.
- The approved pricing formula in `lib/booking/calculate.ts`.
- The production BookingKoala link (`lib/config.ts`'s
  `businessConfig.bookingUrl`) — entirely unrelated to this system.
- Introducing a service-account JSON key, `GOOGLE_PRIVATE_KEY`,
  `GOOGLE_APPLICATION_CREDENTIALS`, or any `NEXT_PUBLIC_GOOGLE_*` variable —
  the keyless design in §1 is deliberate.
