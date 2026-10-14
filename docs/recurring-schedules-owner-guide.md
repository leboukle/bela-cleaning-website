# Recurring cleanings — owner guide (Preview)

For the owner. No technical requests are needed: everything below is a
sheet edit or a button. Do **Preview only**; nothing here touches Production.

## 1. One-time Preview setup

**Which sheet is the Preview sheet?** The one this Preview website is
connected to. Don't guess from names: after step 4 below, open
`https://preview.belacleaning.com/internal/recurring` — its **Setup check**
prints the spreadsheet's *title* and the last 6 characters of its ID. Compare
that with the sheet you have open (File → Share, or the address bar
`…/spreadsheets/d/<ID>/edit`: the ID ends in the same 6 characters). If they
differ you are editing the wrong sheet. (Preview and Production use different
sheets; the Production one must not be touched.)

**Which Apps Script project?** In the *same* spreadsheet: **Extensions → Apps
Script**. That project is bound to that sheet. It is the right one if its
**Project Settings → Script properties** include `PROCESS_DUE_ENDPOINT_URL`
whose value starts with `https://bela-payments-preview.vercel.app` (the
Preview address). Never paste anything into a Script Properties value that is
not a URL.

1. **Bookings tab** — header row, cell **BS1**: type `Occurrence Number`.
   (BQ1 must read `Pricing Policy` and BR1 `Recurring Schedule ID`.)
2. **New tab** named exactly `Recurring Schedules`. Click cell **A1** and
   paste the single line in
   [`docs/recurring-schedules-headers.tsv`](./recurring-schedules-headers.tsv)
   (48 tab-separated headers; they fill A1 through AV1).
3. **New tab** named exactly `Recurring Schedule Events`. Click **A1** and
   paste the line in
   [`docs/recurring-schedule-events-headers.tsv`](./recurring-schedule-events-headers.tsv)
   (7 headers, A1–G1).
4. Open `https://preview.belacleaning.com/internal/recurring`, enter your
   internal access code, and read **1. Setup check**. Every line must show ✓.
   Press **Test the sheet's duplicate protection** — it must say *Passed*.
   (If it ever says *FAILED*, stop and tell me; do not enable recurring
   scheduling.)
5. **Apps Script** (same project): add a file, paste
   [`apps-script/recurringScheduler.gs`](../apps-script/recurringScheduler.gs).
   Project Settings → Script properties → add
   `RECURRING_RECONCILE_ENDPOINT_URL` =
   `https://bela-payments-preview.vercel.app/api/recurring/reconcile`.
   Select `createRecurringReconcileTrigger` and **Run** once; approve the
   prompt. (`PAYMENT_SCHEDULER_SECRET` and `VERCEL_PROTECTION_BYPASS` are
   already there from the other schedulers.)
6. Nothing to change in Vercel or Stripe.

The same one-line headers also fit Excel/CSV exports. Preview sends **real
emails** (shared Gmail sender) — always book with your own address.

## 2. Where each owner control lives

All on `https://preview.belacleaning.com/internal/recurring` (same access code
as the assign-cleaner page; a link on that page leads here).

| Control | Where | Notes |
|---|---|---|
| Mark complete | **Recurring cleanings → 3. Active recurring schedules → [the schedule's appointment] → Mark complete**. Also on `/internal/assign-cleaner` ("Mark a booking complete"). | A future visit asks for confirmation first. Creates the next appointment immediately. |
| Mark unperformed | Same appointment box → **Mark unperformed** | Disabled once the charge has been attempted (refund in Stripe instead). Closes it as no-charge and moves the schedule on. |
| Review a blocked schedule | **2. Needs your attention** | Plain-English reason + what to do. Also emailed once. |
| Skip an occurrence | The schedule card → **Skip this occurrence** | Only when no appointment is upcoming (i.e. blocked). The series continues from the following regular date. |
| Resume | The schedule card → **Resume schedule** | Only for a paused schedule (payment failure). |
| End a schedule | The schedule card → **End schedule** | Same as the customer's Stop: upcoming appointment cancelled under the normal policy. |
| Convert an existing booking | **4. Convert an existing booking** | Pick the booking, tick "customer has confirmed", write how/when, press Convert. Nothing is converted automatically. |
| Run the check now | **1. Setup check → Run recurring check now** | Same safe check the 30-minute timer runs. |

## 3. Why the "winner" is trustworthy on the real sheet

*(Engineering review — see also `recurringScheduleService.ts`.)*

Every contested decision is settled by an **append followed by a read in
sheet order**, never by in-memory state:

* Appends use `insertDataOption=INSERT_ROWS`: each request's row is inserted
  as a *new* row after the table's last row, so concurrent requests cannot
  overwrite each other, and the append response states which row this request
  got (`updates.updatedRange`).
* A later read returns committed rows in row order. "The first row carrying
  key K" is therefore identical for every reader on any serverless instance.
* **Occurrence creation**: the new appointment is appended to *Bookings*; the
  caller re-reads that schedule's rows (one `batchGet`, a single snapshot) and
  wins only if its Booking ID is the first row for that occurrence number.
  A loser marks its own row *Cancelled — No Charge*. The payment endpoint also
  refuses to charge any row that is not the first for its occurrence.
* **Notification / alert claiming**: a claim row is appended to *Recurring
  Schedule Events*; the claimant reads the claim column once and wins only if
  the first row with that key is the row number *its own append returned*.
  Retries use numbered claims (`…:1`, `…:2`, max 3) so a crash after a claim
  is retried rather than lost, and a delivered email is never re-sent.
* **Concurrent initial schedule creation**: the schedule row is appended,
  then the first row for that Schedule ID wins; any other row marks itself
  `Duplicate` (a write to its own row), and every read ignores it.
* **Stop racing generation**: the schedule is set `Ended` *before* the sweep;
  a generator re-reads status *after* its append and voids itself if not
  Active. Either order ends with no live future appointment.
* **Crash recovery**: progress is rebuilt from the Bookings rows themselves.

What this relies on — and what in-memory tests cannot prove — is that Google
Sheets really orders committed appends and serves reads after them. The
repository code is exercised against a simulator of that behaviour (including
the exact A1 ranges), and the **"Test the sheet's duplicate protection"**
button fires 8 simultaneous claims at your real sheet, 3 rounds, and must see
exactly one winner each time. That button is the live evidence.

Residual (documented, accepted): between a duplicate row's append and its
loser voiding itself — milliseconds to seconds — the extra row exists but is
never chargeable (charges happen ≥ 1 hour after a visit ends and are refused
by the first-row guard), and it is voided by the loser or by the 30-minute
reconcile.

## 4. Live Preview test script

Today is **Wed 14 Oct 2026**. Bookings need **120 hours (5 days)** notice, so
the earliest allowed is Mon 19 Oct at the current time of day; use
**Tue 20 Oct 2026, 9:00 AM** (every date below is relative to that).

**Safety conditions** (marking a *future* visit complete is only safe because):
Stripe on Preview is in **test mode** (`pk_test_…`), so any charge uses a test
card; the customer is **your own email**; and **no real cleaner** is assigned
(a cleaner's payout statement is sent when a visit is marked complete — assign
nobody, or a test cleaner with your own email). If any condition is not true,
don't mark future visits complete.

Use your own email and Stripe test card `4242 4242 4242 4242`.

| # | Do | Expect |
|---|---|---|
| 0 | Setup check ✓ everywhere; press **Test the sheet's duplicate protection**. | "Passed". |
| 1 | Book **Weekly** on Tue 20 Oct, 9:00 AM, any size. On Review write down **First cleaning total = A** and **"Estimated total for later cleanings = B each"**. Try submitting *without* ticking the recurring consent. | Submit stays disabled until the consent box is ticked. |
| 2 | Submit. Open the Bookings tab and the Recurring Schedules tab. | Confirmation says "First cleaning total A". One Bookings row: *Occurrence Number* 1, *Frequency Discount* 0, *Total Price* = A. One schedule row: *Status* Active, **AG (Full Price Total) = A**, **AH (Recurring Price Total) = B**, *Consent Version* `recurring-consent-v2`. |
| 3 | `/internal/recurring` → the schedule shows appointment #1, Tue 20 Oct. Press **Mark complete** (confirm the future-date prompt). | New Bookings row: *Occurrence Number* 2, **Service Date 2026-10-27**, *Total Price* = **B**, same Stripe Customer/PaymentMethod IDs, *Payment Status* Scheduled. Page shows appointment #2. |
| 4 | Check email + assignment list. | You receive **one** "Your next cleaning is scheduled" email (with Cancel-this-only and Stop links) and **one** owner "Needs assignment" email. `/internal/assign-cleaner` lists the new booking. **Don't assign a real cleaner.** |
| 5 | **Repeated requests:** press **Mark complete** on #1 again (use `/internal/assign-cleaner` → mark complete with its Booking ID), then press **Run recurring check now** three times. | Still **exactly one** non-cancelled future row for occurrence 2 (filter Bookings by *Recurring Schedule ID*); no second email. |
| 6 | **Cancel only one:** open the Manage link from the email → **Cancel this cleaning only**. Read the confirmation (names 27 Oct, says the series continues, "free"). Confirm. | Row for 27 Oct: *Cancelled / Cancelled — No Charge*. A new row: *Occurrence Number* 3, **2026-11-03**, *Total Price* B. Schedule still **Active**. |
| 7 | **Blackout blocks generation:** in the **Blackout Dates** tab add a row: `2026-11-10`, reason `Test`, `TRUE`. Then on `/internal/recurring` **Mark complete** appointment #3 (3 Nov). | Nothing new is created. Schedule appears under **2. Needs your attention** with reason *blackout*; you get **one** owner email; Bookings has no row for occurrence 4. Pressing **Run recurring check now** several times sends no more emails. |
| 8 | Remove (or set to FALSE) the blackout row; press **Run recurring check now**. | Occurrence 4 is created for **2026-11-10**; attention box clears. |
| 9 | **Unperformed:** on appointment #4 press **Mark unperformed** and confirm. | Row: *Cancelled*, *Payment Status* **Cancelled — No Charge**, *Stripe Payment Intent ID* **blank**, and it is never charged (payment scheduler skips cancelled). A new occurrence 5 (2026-11-17) is created. |
| 10 | **Stop:** open occurrence 5's Manage link → **Stop recurring cleanings**. | Confirmation shows two separate blocks: "1. Ending… Stopping has no fee" and "2. Your upcoming cleaning… (No fee — more than 24 hours away)". Confirm: schedule *Status* **Ended**, the 17 Nov row cancelled, and **Run recurring check now** creates nothing more. |

Optionally also test a *late* stop: book a visit ≥5 days away, then edit its
*Service Date* in the sheet to tomorrow before opening Stop — the page must
show the 50% fee on the upcoming visit separately from "Stopping has no fee".

## 5. Consent and Terms — exact text for your review

These are drafts for you (and counsel, if you use one) to approve; I'm not
giving legal advice. Nothing is in Production.

**Consent checkbox at booking** (version `recurring-consent-v2`, required for
weekly / every-other-week / monthly, stored on the schedule):

> I authorize BeLa Cleaning to automatically schedule my recurring cleanings
> and to charge my saved card for each cleaning one hour after it ends, in
> the amount shown for that cleaning. I understand that cancelling one
> cleaning keeps my recurring schedule going, that stopping recurring
> cleanings ends the schedule with no fee for stopping, and that any cleaning
> cancelled within 24 hours of its start time is subject to the
> late-cancellation fee of 50% of its total.

**Shown beside the first-cleaning total:**

> Your first cleaning is charged at the regular price. After it is completed,
> we schedule your next cleaning automatically and apply your recurring
> discount to it and to every later cleaning. Each cleaning is charged to your
> saved card one hour after it ends.
>
> In Manage Booking you can cancel one cleaning (your recurring cleanings
> continue) or stop recurring cleanings (no more cleanings are scheduled).
> Stopping itself has no fee; a cleaning cancelled within 24 hours of its
> start time is subject to the late-cancellation fee.

**Terms of Service changes** (`app/terms/page.tsx`; no section renumbering —
text is added inside the existing Sections 7 and 8; the "Last updated" date
is for you to set at release):

*Section 7 (Cancellations and Rescheduling), appended:*

> **Recurring cleanings.** If you book a recurring schedule, Manage Booking
> offers two different actions:
> - **Cancel one cleaning** cancels only that appointment. Your recurring
>   schedule continues and the next regular appointment is scheduled. The
>   cancellation rules above apply to that appointment.
> - **Stop recurring cleanings** ends your recurring schedule so no further
>   appointments are scheduled. Stopping itself has no fee. Your
>   already-scheduled upcoming appointment is cancelled at the same time
>   under the rules above: free if it is more than 24 hours before its
>   scheduled start time; if it is within 24 hours, the late-cancellation fee
>   for that appointment applies. Manage Booking shows that appointment and
>   any fee before you confirm.

*Section 8 (Payment), appended:*

> **Recurring cleanings.** If you choose a weekly, every-other-week, or
> monthly frequency, you authorize BeLa Cleaning to schedule each next
> cleaning on your recurring schedule automatically and to charge the saved
> payment method for each cleaning, starting one hour after its scheduled end
> time, in the amount shown for that cleaning, until you stop recurring
> cleanings. Your first cleaning is charged at the regular price; once a
> cleaning has been performed, later cleanings receive the recurring discount
> for your selected frequency, based on the service details you booked. If
> your service details change, the price of later cleanings may change, and
> BeLa Cleaning will tell you before it is charged. We email you when each
> cleaning is scheduled and again before it takes place. You may stop
> recurring cleanings at any time as described in Section 7.

The stop confirmation screen separates **(1) ending recurrence — "Stopping
has no fee"** from **(2) the upcoming cleaning — its date, time, total and
either "No fee" or "late-cancellation fee of $X … not for stopping"**.
