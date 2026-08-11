# Payment Scheduler — Apps Script Setup

`paymentScheduler.gs` is a Google Apps Script bound to the Bookings
spreadsheet. On a 15-minute timer, it scans the Bookings sheet for rows
that look due for their automatic scheduled charge, and calls BeLa's
`POST /api/payments/process-due` endpoint with just their Booking IDs. It
never talks to Stripe directly and never stores a Stripe secret key — see
[`docs/payments.md`](../docs/payments.md) for the full architecture.

This is a one-time setup performed manually in the Google Sheets UI —
nothing here is deployed automatically alongside the Vercel app.

## Setup steps

1. Open the live Bookings Google Sheet.
2. **Extensions > Apps Script.** This opens a script project already
   bound to this specific spreadsheet.
3. Delete any placeholder `Code.gs` content, then paste in the full
   contents of [`paymentScheduler.gs`](./paymentScheduler.gs).
4. **Project Settings** (gear icon, left sidebar) **> Script Properties >
   Add script property**, and add exactly these three:

   | Property | Value |
   |---|---|
   | `PROCESS_DUE_ENDPOINT_URL` | The stable Preview endpoint URL for process-due (see below) — **no query string, no secrets in the URL itself** |
   | `PAYMENT_SCHEDULER_SECRET` | The same value as Vercel's `PAYMENT_SCHEDULER_SECRET` environment variable |
   | `VERCEL_PROTECTION_BYPASS` | The same value as Vercel's Protection Bypass for Automation secret |

   Script Properties are private to this script project — never visible
   in spreadsheet cells, never in the script's source, never exported with
   the sheet.

5. Back in the editor, select the `createTimeDrivenTrigger` function from
   the function dropdown at the top, then click **Run**.
6. The first run prompts an authorization screen (this project needs
   permission to make external requests and manage its own triggers) —
   review and click **Allow**.
7. Confirm the trigger was installed: **Triggers** (clock icon, left
   sidebar) should show `runPaymentScheduler` on a time-driven, every-15-
   minutes schedule.

That's it — no further manual steps. `runPaymentScheduler` now runs every
15 minutes automatically, with no dependency on BeLa staff opening the
Sheet, Vercel, or Stripe.

## Exact URL used

`PROCESS_DUE_ENDPOINT_URL` is the app's **stable Preview alias**
(`https://bela-payments-preview.vercel.app/api/payments/process-due` — see
`docs/payments.md` for how that alias is configured and kept pointed at
the current deployment), never a per-deployment Vercel URL, and never
carries the Protection Bypass secret in its query string — that secret is
sent as the `x-vercel-protection-bypass` header instead, set in code from
the `VERCEL_PROTECTION_BYPASS` script property. This is the opposite of
how the Stripe webhook is configured (Stripe cannot set custom headers on
webhook delivery, so its bypass secret has to go in the URL) — see
`docs/payments.md`'s "Vercel Protection Bypass" section for why the two
integrations are configured differently.

## Verifying it ran

**Executions** (the icon that looks like a list, left sidebar) shows every
past run of `runPaymentScheduler`, with its `Logger.log` output — how many
due bookings it found, the Booking IDs, and the process-due endpoint's
response. This is the first place to check if a scheduled charge doesn't
seem to have happened.

## Changing the schedule or secrets later

- To change the 15-minute cadence, edit `everyMinutes(15)` in
  `createTimeDrivenTrigger()`, then re-run that function once (it deletes
  its own prior trigger before installing the new one, so it's safe to
  re-run).
- To rotate a secret, update the Script Property value here **and** the
  matching Vercel environment variable — they must always match exactly.
