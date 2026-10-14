# Automatic recurring appointments

Weekly, every-other-week and monthly bookings create **automatic recurring
appointments**. The customer books once; each later appointment is created
by the server — no rebooking — and flows through the existing reminder,
payment, assignment, cancellation and rescheduling workflows unchanged.

## Rules

| Topic | Rule |
|---|---|
| Initial appointment | Full price. It is occurrence 1 and starts the schedule. |
| Later appointments | Existing frequency discount (weekly 15%, every other week 10%, monthly 5%) on the **bedroom base price only**. |
| When the discount starts | Only once a cleaning of the schedule has actually been **performed** (marked complete). A cancelled or unperformed first appointment does not earn it: the next appointment is still full price. |
| Quote | The agreed recurring amount is snapshotted on the schedule (component prices **and** the discount rate at agreement). Later configuration changes never reprice an existing schedule. |
| How many exist | At most **one** upcoming non-cancelled appointment per schedule. |
| Next appointment is created | When the current one is marked complete, or cancelled / marked unperformed while the schedule stays active. A reconciliation scheduler retries anything missed. |
| Charge | Existing: one hour after scheduled end, off-session, on the saved card (the per-row Stripe Customer / PaymentMethod IDs are copied from the schedule). Retry behavior and cancellation-fee calculation are unchanged. |
| Reminder | Existing 72-hour customer reminder; for a recurring appointment it also carries the two separate controls. |
| Cleaner assignment | Stays manual. A generated appointment appears in the existing assignable-bookings list and the owner is emailed once. Cleaner pay is unchanged (60% of the appointment's charge). |

## Cadence

Occurrences are computed **from the original anchor date** (never from the
previous appointment), at the anchor's local wall-clock time in
America/New_York, so DST never moves the visit.

* Weekly: every 7 days. Every other week: every 14 days.
* Monthly: the **same numbered calendar date** each month. An anchor on the
  29th–31st is clamped to the last day of shorter months and returns to the
  anchor day in later months (Jan 31 → Feb 28 → Mar 31 → Apr 30 → May 31).
* Rescheduling or skipping one appointment never shifts the anchor.

## Data model

### Bookings sheet — one new column

| Column | Header | Meaning |
|---|---|---|
| BQ | `Pricing Policy` | (existing from the Preview pricing work) blank = pre-policy row |
| BR | `Recurring Schedule ID` | the schedule's ID (= its initial appointment's Booking ID) |
| **BS** | **`Occurrence Number`** | **1 for the initial appointment, then 2, 3, …; blank otherwise** |

(Recurring Schedule ID, Occurrence Number) is the unique key of an appointment.

### `Recurring Schedules` worksheet (new tab) — one row per schedule

Row 1 must contain exactly these headers, in this order:

| Col | Header |
|---|---|
| A | Schedule ID |
| B | Status |
| C | Review Reason |
| D | Review Since |
| E | Frequency |
| F | Frequency Rate |
| G | Anchor Date |
| H | Anchor Start Time |
| I | Timezone |
| J | First Name |
| K | Last Name |
| L | Email |
| M | Mobile |
| N | Street Address |
| O | Apartment or Unit |
| P | City |
| Q | State |
| R | ZIP Code |
| S | Someone Home |
| T | Property Type |
| U | Square Footage |
| V | Bedrooms |
| W | Bathrooms |
| X | Cleaning Type |
| Y | Extras |
| Z | Estimated Duration Minutes |
| AA | Special Instructions |
| AB | Base Cleaning Price |
| AC | Bathroom Price |
| AD | Square Footage Price |
| AE | Cleaning Type Price |
| AF | Extras Price |
| AG | Full Price Total |
| AH | Recurring Price Total |
| AI | Pricing Policy |
| AJ | Stripe Customer ID |
| AK | Stripe PaymentMethod ID |
| AL | Stripe SetupIntent ID |
| AM | Consent Version |
| AN | Consent At |
| AO | Source Booking ID |
| AP | Created At |
| AQ | Next Occurrence Number |
| AR | Last Occurrence Number |
| AS | Last Booking ID |
| AT | Last Generated At |
| AU | Ended At |
| AV | Ended Reason |

### `Recurring Schedule Events` worksheet (new tab) — audit trail and once-only claims

Row 1: `Event ID`, `Timestamp`, `Schedule ID`, `Occurrence Number`, `Event Type`, `Claim Key`, `Detail`

Append-only. Besides the audit history it is the arbiter for side effects
that must happen at most once (customer confirmation, owner alerts):
a claim row is appended and the **earliest** row for a key wins.

## Reliability: one serialized creation path

All appointment creation goes through `generateNextOccurrence`
([recurringScheduleService.ts](../lib/booking/server/recurringScheduleService.ts)).
An in-process lock or a check-then-append is not enough on Vercel (two
instances share nothing, and Sheets has no unique constraint), so it uses
**append-then-arbitrate**:

1. Decide that an appointment is due (schedule Active, no open appointment,
   date available, price from the snapshot) and **append** it.
2. Re-read the schedule's Bookings rows in sheet order. The **first** row for
   that occurrence number is the only valid one — Sheets assigns rows in
   append order, so every concurrent request on any instance reaches the same
   verdict. A loser voids its own row as a free "Cancelled — No Charge"
   cancellation and sends nothing.
3. Re-read the schedule: if it was stopped or paused meanwhile, void the new row.
4. Only then record progress, and send the confirmation once (claim).

Backstops: a crash after the append leaves a valid row that reconciliation
adopts (progress is rebuilt from the Bookings rows); the payment endpoint
refuses to charge any row that is not the first for its occurrence; and
reconciliation voids stray duplicates. Residual risk: the arbitration is
append-order based, not a database transaction — see "Known limitations".

## Customer controls (Manage Booking)

Two clearly separate actions, each showing the **exact appointment** and any
**fee** before confirmation:

* **Cancel this cleaning only** — existing cancellation policy; the schedule
  stays active and the next regular occurrence is created.
* **Stop recurring cleanings** — ends the schedule and cancels its upcoming
  appointment under the existing policy (free more than 24h out, otherwise
  the existing late fee). Booking and payment history are kept; only the
  schedule's Status changes. Idempotent.

Both are reachable from the 72-hour reminder and from each appointment's
"next cleaning scheduled" email (`?action=cancel-one` / `?action=stop` open
the matching confirmation). Rescheduling changes that appointment only.

## Owner operations

Endpoints require the internal admin session cookie or the
`x-internal-admin-secret` header. `BASE` is the deployment URL.

```bash
# Mark a visit complete (also creates the next appointment) — existing endpoint
curl -X POST -H "x-internal-admin-secret: $SECRET" "$BASE/api/internal/bookings/<bookingId>/complete"

# The visit did not happen: closes it as no-charge and advances the schedule.
# Must be done BEFORE the charge fires (service end + 1 hour).
curl -X POST -H "x-internal-admin-secret: $SECRET" "$BASE/api/internal/bookings/<bookingId>/unperformed"

# Blocked on a blackout/unavailable date and you want to skip that occurrence
curl -X POST -H "x-internal-admin-secret: $SECRET" "$BASE/api/internal/recurring-schedules/<scheduleId>/skip-occurrence"

# Resume a schedule paused by a final payment failure
curl -X POST -H "x-internal-admin-secret: $SECRET" "$BASE/api/internal/recurring-schedules/<scheduleId>/resume"

# End a schedule (same handling as the customer's Stop)
curl -X POST -H "x-internal-admin-secret: $SECRET" "$BASE/api/internal/recurring-schedules/<scheduleId>/end"

# Convert ONE existing frequency-labelled booking, after the customer confirmed
curl -X POST -H "x-internal-admin-secret: $SECRET" -H "content-type: application/json" \
  -d '{"bookingId":"BELA-…","customerConfirmed":true,"confirmationNote":"Confirmed by email on 2026-10-14"}' \
  "$BASE/api/internal/recurring-schedules/convert"
```

Owner emails (sent once per issue): *needs assignment*, *next appointment
can't be created* (blackout / capacity / too soon), *mark this cleaning
complete* (24h after a visit's end with no completion), *paused: payment failed*.
A blackout or capacity problem resolves itself: remove the blackout and the
next reconcile creates the appointment through the same path.

### Existing bookings

Nothing converts automatically. The conversion above is per booking, requires
`customerConfirmed: true` plus a note, leaves the booking's price, Stripe IDs
and payment history untouched (only BR/BS are written), and records the
agreed ongoing amount and the note in the audit trail. A booking that uses a
legacy arrival window must first be rescheduled to an exact start time.

## Setup (Preview first; repeat for Production only after approval)

1. Bookings sheet: add header **BS1 = `Occurrence Number`** (BQ1 =
   `Pricing Policy` and BR1 = `Recurring Schedule ID` should already exist).
2. Create tab **`Recurring Schedules`**; paste the 48 headers above across row 1.
3. Create tab **`Recurring Schedule Events`**; paste the 7 headers across row 1.
4. Apps Script (same project as the other schedulers): paste
   [`apps-script/recurringScheduler.gs`](../apps-script/recurringScheduler.gs);
   add Script Property `RECURRING_RECONCILE_ENDPOINT_URL` =
   `<stable alias>/api/recurring/reconcile`; run `createRecurringReconcileTrigger()` once.
5. No new environment variables or Stripe changes.
6. Use **owner-controlled test recipients**: Preview shares Production's Gmail
   sender and internal-notification recipient, so every Preview email is
   real. Book with your own email address.

## Known limitations / decisions

* Arbitration is append-order based, not transactional (see above); the
  payment guard and reconciliation are the backstops.
* A visit is charged one hour after its scheduled end whether or not it is
  marked complete. An unperformed visit must be closed **before** then;
  afterwards it is a refund in Stripe.
* There is no customer self-service card replacement. A schedule paused for
  payment failure resumes with the same card.
* Rescheduling the whole series (new weekday/time) is not self-service; a
  customer stops and rebooks, or the owner converts a new booking.
* Reconciliation reads whole columns per schedule: fine at small scale, to be
  revisited if hundreds of schedules are active.
