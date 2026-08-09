# Booking Notifications (Milestone 4)

Companion to [`docs/booking-backend.md`](./booking-backend.md), which covers
the Google Sheets persistence layer this milestone builds on top of. This
document covers the confirmation experience and the two transactional
emails sent after a booking is successfully persisted. **No credential
values appear anywhere in this document — names only.**

## 1. Notification architecture

```
bookingService.submitBooking()
  1-8. (unchanged from Milestone 3: validate, price, generate ID, append)
  9. sendBookingNotifications(notificationService, repository, record)   <-- new
       -> notificationService.sendCustomerBookingReceived(record)
       -> notificationService.sendInternalNewBookingNotification(record)
          (both run via Promise.allSettled — neither can throw past this
          point, and neither's outcome changes the booking's own success
          result)
       -> repository.updateNotificationStatus(bookingId, { ... })
          (fills in the 3 columns from §7; itself wrapped in try/catch,
          same isolation guarantee)
```

The booking workflow depends on `NotificationService`
([`lib/booking/server/notificationService.ts`](../lib/booking/server/notificationService.ts)),
which itself depends on the `EmailTransport` interface
([`lib/booking/server/email/emailTransport.ts`](../lib/booking/server/email/emailTransport.ts)) —
never on a concrete vendor. `bookingService.ts` doesn't even depend on the
concrete `NotificationService` class; it depends on
`NotificationSender = Pick<NotificationService, "sendCustomerBookingReceived" | "sendInternalNewBookingNotification">`,
the same narrowing pattern `calculate.ts`'s `PricingInput` already uses —
so a test double just needs to implement those two methods, no class
inheritance required. See §9 for the replacement boundary this creates.

## 2. Customer email

Built by [`buildCustomerBookingReceivedEmail`](../lib/booking/server/email/templates/customerBookingReceived.ts) —
a pure function, `BookingRecord -> { subject, text, html }`, no I/O.

- Subject: `BeLa Cleaning — Booking [BOOKING ID]`
- Body: first name, booking ID, cleaning type, service date, arrival
  window, service address, estimated duration, estimated total,
  frequency (only when recurring), extras (only when present, described
  in human-readable form via `extrasDescription.ts` — see §2.1), current
  status in plain language (never "confirmed," never "paid"), the 24-hour
  cancellation/change policy reminder, and BeLa's contact info (from
  `lib/config.ts`'s `businessConfig` — the same source the rest of the
  site already uses, not duplicated here).
- Never exposes Google Sheets, spreadsheet IDs, row numbers, or any other
  infrastructure detail.

### 2.1 Extras description

The Bookings sheet's `Extras` column stores a compact, stable format (see
`extras.ts`'s own comment) like `kitchenCabinets;interiorWindows:3`.
[`extrasDescription.ts`](../lib/booking/server/extrasDescription.ts) turns
that back into `["Inside kitchen cabinets", "Interior windows × 3"]` for
display in both emails — kept as its own module since it's a display
concern, independent of the column's actual serialization contract.

## 3. Internal BeLa notification

Built by [`buildInternalNewBookingEmail`](../lib/booking/server/email/templates/internalNewBooking.ts).

- Subject: `New BeLa Booking — [BOOKING ID] — [SERVICE DATE]`
- Body: the complete operational record — booking ID, submitted
  timestamp, customer name/email/phone, complete address, property type,
  square footage, bedrooms, bathrooms, cleaning type, extras (always
  shown, `"None"` rather than omitted when there are none), frequency,
  appointment date, arrival window, someone-home status, special
  instructions (`"None"` when empty), estimated duration, total, booking
  status, payment status.
- The recipient is **never** derived from the booking record. It comes
  from `BELA_INTERNAL_NOTIFICATION_EMAIL` exclusively
  ([`gmailAuth.ts`](../lib/booking/server/email/gmailAuth.ts)'s
  `getInternalNotificationEmail()`), so a customer can never redirect this
  email to themselves or a third party by manipulating their own submitted
  email address.

## 4. Email transport: Gmail API via OAuth 2.0

`GmailApiTransport implements EmailTransport`
([`lib/booking/server/email/gmailTransport.ts`](../lib/booking/server/email/gmailTransport.ts))
sends via the Gmail API's `users.messages.send`, authenticated with a
standard OAuth 2.0 refresh token — not a service-account JSON key, and
architecturally independent of the WIF/impersonation flow that
`googleAuth.ts` uses for Sheets (two different Google APIs, two different
trust models, deliberately not conflated into one auth module).

```
GMAIL_OAUTH_REFRESH_TOKEN (long-lived, revocable, gmail.send scope only)
  -> exchanged at Google's OAuth token endpoint (oauth2.googleapis.com/token)
  -> short-lived Gmail API access token (~1 hour, cached in memory)
  -> authorizes users.messages.send only
```

The raw RFC 2822 MIME message (multipart/alternative: one text/plain part,
one text/html part) is hand-built by
[`mimeMessage.ts`](../lib/booking/server/email/mimeMessage.ts) rather than
pulling in a mail-composition library — the shape needed here is small and
stable enough that a dependency would add more weight than value. Subject
and From-name are RFC 2047 encoded (UTF-8 base64 encoded-word) to safely
carry the non-ASCII em dash in "BeLa Cleaning — Booking ...".

### Required environment variables (names only)

| Variable | Purpose |
|---|---|
| `GMAIL_OAUTH_CLIENT_ID` | OAuth client identifying this app to Google |
| `GMAIL_OAUTH_CLIENT_SECRET` | Paired secret for the OAuth client |
| `GMAIL_OAUTH_REFRESH_TOKEN` | Long-lived, revocable, `gmail.send`-scoped |
| `GMAIL_SENDER_EMAIL` | The Workspace address emails are sent from |
| `BELA_INTERNAL_NOTIFICATION_EMAIL` | Recipient for internal notifications |

All five are configured on both Preview and Production in Vercel, marked
Sensitive. The full manual setup sequence (API enablement, OAuth consent
screen, client creation, one-time authorization) was reported to and
performed by the project owner directly — see the milestone's setup
conversation; it is intentionally not duplicated here since this document
is committed to source control.

## 5. Failure handling — a booking is never lost to an email problem

`sendBookingNotifications()` in `bookingService.ts` runs strictly *after*
`repository.appendBooking()` has already succeeded, and wraps both sends
in `Promise.allSettled` — a rejected promise, a `{ok:false}` result, or an
outright thrown error from either send is caught, logged (bookingId +
ok/failed status only — never the recipient address, subject, or body),
and never changes the function's return value. The customer-facing
response is always the same successful `{ ok: true, bookingId, ... }`
shape regardless of what happened with either email.

### What happens if Google temporarily rejects the email

The send attempt fails, is logged with a sanitized reason, and the booking
remains exactly as valid as any other. No automatic retry queue exists
this milestone — introducing one would mean a new persistent service,
which is out of scope and disproportionate at this business's volume
(~2 bookings/day).

### How BeLa can identify a booking whose customer wasn't emailed

Two ways now: filter the Bookings sheet's **Customer Confirmation Status**
/ **Internal Notification Status** columns (§7) for `Failed` (or blank,
which means the status write itself also didn't complete — see §7's
failure-isolation note), or search Vercel's function logs for
`customer confirmation email failed: bookingId=...`. The sheet is the more
convenient day-to-day view; the logs remain the fallback for the rare case
where the status write itself failed too.

### How an email can later be resent

`NotificationService.sendCustomerBookingReceived(record)` /
`sendInternalNewBookingNotification(record)` are already independently
callable with just a `BookingRecord` — nothing about them is coupled to
the original submission request. A future small internal tool (out of
scope this milestone) could look up a booking by ID and re-invoke either
method directly.

## 6. Duplicate-email protection

Notification sending is placed *inside* the same idempotency-guarded
branch that performs the Sheets append (see `bookingService.ts`) — not
alongside it. Concretely: `withIdempotencyFastPath` and the repository's
`findRecentBookingByIdempotencyToken` check both short-circuit *before*
notifications are ever attempted whenever a request is recognized as a
retry of an already-accepted booking (whether via the in-memory fast path
or the authoritative Sheets-based lookup). Emails are only ever sent from
the one code path that also performs a fresh `appendBooking()` call, so:

```
one accepted booking (one fresh appendBooking call)
  -> exactly one customer confirmation attempt
  -> exactly one internal notification attempt
```

verified directly in `bookingService.test.ts` (concurrent same-token
requests, and a sequential retry of an already-accepted token, both
produce exactly one row and one call to each notification method).

## 7. Google Sheet schema additions — implemented, approved before the change

The original proposal was 4 columns (separate timestamps per email); the
approved, implemented version is the minimal 3-column set the project owner
asked for instead — one shared attempt timestamp, since both sends
currently always happen together (no retry queue exists yet — see §5):

| Column | Position | Purpose |
|---|---|---|
| Customer Confirmation Status | 42 (`AP`) | `Sent` / `Failed` |
| Internal Notification Status | 43 (`AQ`) | `Sent` / `Failed` |
| Notification Attempt At | 44 (`AR`) | ISO timestamp of the send attempt |

Appended at the *end* of `BOOKINGS_COLUMNS`
([`bookingsSheetSchema.ts`](../lib/booking/server/bookingsSheetSchema.ts))
rather than interleaved — every Milestone 3 column keeps its exact
original position (A through `AO`, unchanged).

**Write sequencing**: all 3 cells are written **blank** (`""`) at the
moment `appendBooking()` first creates the row — the outcome genuinely
isn't known yet at that instant. `GoogleSheetsBookingRepository.updateNotificationStatus()`
(a new `values.update` PUT call, added alongside `sheetsClient.ts`'s
existing `getRange`/`batchGetRanges`/`appendRow`) then fills them in
moments later, once both send attempts resolve. The row is located by
scanning the Booking ID column for a match — the same pattern
`bookingIdExists` already uses — since Google Sheets API updates target a
row by its actual position, not a stable row ID.

**Failure isolation, same guarantee as the emails themselves**: the status
write is wrapped in its own try/catch inside `sendBookingNotifications()`
— if writing the status columns fails (e.g. a transient Sheets error), the
booking is still returned as successful and the 3 cells simply stay blank
rather than being retried or blocking anything. Verified directly:
`bookingService.test.ts`'s "still returns a successful booking result when
recording the notification status itself fails" test.

**Live-sheet note**: the code writes to columns `AP:AR` regardless of
whether the actual Bookings tab has header labels in row 1 for them yet —
Sheets doesn't require a header to accept a value. For the columns to
*display* correctly labeled in the spreadsheet UI, add "Customer
Confirmation Status" / "Internal Notification Status" / "Notification
Attempt At" to row 1 of `AP1:AR1` — a cosmetic step, not a functional
blocker, and not performed automatically as part of this change.

## 8. Privacy and security

- Every email is built and sent entirely server-side
  (`lib/booking/server/email/*`, all `"server-only"`-guarded); nothing
  about a Gmail credential or the email body ever reaches a client bundle.
- Log lines never include the recipient address, subject, or body — only
  `bookingId` and a `sent`/`failed` outcome (see `sendBookingNotifications`
  in `bookingService.ts` and the sanitized error logging in
  `gmailAuth.ts`/`gmailTransport.ts`, which mirror `sheetsClient.ts`'s
  existing "status + short reason, never the response body" pattern).
- The customer's email address is the same one `validateSubmission.ts`
  already validated server-side for Milestone 3 — nothing here trusts a
  second, different value.
- The internal notification recipient is read once from
  `BELA_INTERNAL_NOTIFICATION_EMAIL` and can never be influenced by
  request input (see §3).
- Header injection: customer-controlled text only ever appears in a MIME
  part's *body*, after the blank line separating headers from content
  (`mimeMessage.ts`) — never concatenated into a header line. A second
  layer, `emailSanitize.ts`'s `sanitizeHeaderValue()`, strips any `\r`/`\n`
  from header-bound values (the "to" address, the subject, the from name)
  regardless, as defense in depth.
- No password, refresh token, or client secret is ever committed — only
  the environment variable *names* appear in code and in this document.

## 9. Future provider replacement boundary

Everything above `EmailTransport` — `NotificationService`, both templates,
`bookingService.ts`, the confirmation UI — has no knowledge that Gmail is
the current transport. Swapping providers later (a transactional email
API, a different Workspace mechanism, etc.) means writing one new class
implementing `EmailTransport` and changing the single construction point
in `app/api/booking/route.ts` (`new NotificationService(new GmailApiTransport())`).
Nothing else in the notification or booking domain needs to change — the
same boundary Milestone 3 already established for `BookingRepository`.
