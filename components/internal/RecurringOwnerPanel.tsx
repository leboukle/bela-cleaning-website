"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/booking/calculate";
import { formatReadableDate } from "@/lib/booking/schedule";
import type { OwnerDashboard, OwnerScheduleCard, SetupCheck } from "@/lib/booking/server/ownerRecurringDashboard";

type Banner = { kind: "success" | "error"; message: string } | null;

type Props = {
  setup: SetupCheck | null;
  setupError: string | null;
  dashboard: OwnerDashboard | null;
  dashboardError: string | null;
};

const card = "rounded-2xl border border-[#E7DECE] bg-white p-6 shadow-[0_1px_3px_-1px_rgba(59,47,39,0.08)]";
const btn =
  "rounded-full border-2 px-4 py-2 text-sm font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50";
const btnPrimary = `${btn} border-[#3B2F27] bg-[#3B2F27] text-white hover:bg-[#2A211C]`;
const btnQuiet = `${btn} border-[#3B2F27] text-[#3B2F27] hover:bg-[#F1E9DC]`;
const btnDanger = `${btn} border-[#B14A2E] text-[#B14A2E] hover:bg-[#FBEEE8]`;

export default function RecurringOwnerPanel({ setup, setupError, dashboard, dashboardError }: Props) {
  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  async function run(key: string, url: string, init: RequestInit | undefined, reloadOnSuccess = true) {
    setBusy(key);
    setBanner(null);
    try {
      const res = await fetch(url, { method: "POST", ...init });
      const body = await res.json().catch(() => ({}));
      const message =
        body.message ??
        (body.outcome ? `Done (${String(body.outcome)}).` : res.ok ? "Done." : "Something went wrong. Please try again.");
      setBanner({ kind: body.ok === false || !res.ok ? "error" : "success", message });
      if (reloadOnSuccess && res.ok && body.ok !== false) setTimeout(() => window.location.reload(), 1200);
    } catch {
      setBanner({ kind: "error", message: "Something went wrong. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/internal/session", { method: "DELETE" });
    } finally {
      window.location.reload();
    }
  }

  const attention = dashboard?.schedules.filter((s) => s.needsAttention) ?? [];
  const active = dashboard?.schedules.filter((s) => !s.needsAttention && s.status === "Active") ?? [];
  const ended = dashboard?.schedules.filter((s) => s.status === "Ended") ?? [];

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <button type="button" onClick={logout} disabled={loggingOut} className="text-sm font-medium text-[#8A7A6B] underline underline-offset-2 hover:text-[#6B5B4C]">
          {loggingOut ? "Logging out…" : "Log out"}
        </button>
      </div>

      {banner && (
        <div
          role="status"
          className={`rounded-xl border p-3 text-sm ${
            banner.kind === "success" ? "border-[#C9BCA6] bg-[#F1E9DC] text-[#3B2F27]" : "border-[#E3B7A6] bg-[#FBEEE8] text-[#B14A2E]"
          }`}
        >
          {banner.message}
        </div>
      )}

      {/* ---------------- Setup check ---------------- */}
      <section className={card}>
        <h2 className="font-heading text-lg text-[#3B2F27]">1. Setup check</h2>
        {setupError && <p className="mt-3 text-sm text-[#B14A2E]">{setupError}</p>}
        {setup && (
          <>
            <p className="mt-2 text-sm text-[#6B5B4C]">
              This site is connected to the spreadsheet titled{" "}
              <strong className="text-[#3B2F27]">&ldquo;{setup.spreadsheetTitle}&rdquo;</strong> (ID ends in{" "}
              <code className="rounded bg-[#F1E9DC] px-1">…{setup.spreadsheetIdSuffix}</code>). Confirm this is the
              spreadsheet you intend to use for this website before going further.
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              {setup.items.map((item) => (
                <li key={item.label} className={item.ok ? "text-[#3B2F27]" : "text-[#B14A2E]"}>
                  {item.ok ? "✓" : "✗"} {item.label} — {item.detail}
                </li>
              ))}
            </ul>
            <p className={`mt-3 text-sm font-medium ${setup.allOk ? "text-[#1E5B3A]" : "text-[#B14A2E]"}`}>
              {setup.allOk ? "Setup looks complete." : "Fix the items marked ✗ (see the setup guide), then reload this page."}
            </p>
          </>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className={btnQuiet}
            disabled={busy !== null || !setup?.items.some((i) => i.label.includes("Events") && i.ok)}
            onClick={() => run("selftest", "/api/internal/recurring-schedules/self-test", undefined, false)}
          >
            {busy === "selftest" ? "Testing…" : "Test the sheet's duplicate protection"}
          </button>
          <button
            type="button"
            className={btnQuiet}
            disabled={busy !== null || !setup?.allOk}
            onClick={() => run("reconcile", "/api/internal/recurring-schedules/reconcile-all", undefined)}
          >
            {busy === "reconcile" ? "Checking…" : "Run recurring check now"}
          </button>
        </div>
        <p className="mt-2 text-xs text-[#8A7A6B]">
          The check also runs automatically every 30 minutes. Pressing it repeatedly is safe — it can only ever create
          the one appointment that is due.
        </p>
      </section>

      {dashboardError && <p className="text-sm text-[#B14A2E]">{dashboardError}</p>}

      {dashboard && (
        <>
          {/* ---------------- Needs attention ---------------- */}
          <section className={card}>
            <h2 className="font-heading text-lg text-[#3B2F27]">2. Needs your attention ({attention.length})</h2>
            {attention.length === 0 && <p className="mt-2 text-sm text-[#6B5B4C]">Nothing needs attention right now.</p>}
            <div className="mt-3 space-y-4">
              {attention.map((s) => (
                <ScheduleCard key={s.scheduleId} s={s} busy={busy} run={run} highlight />
              ))}
            </div>
          </section>

          {/* ---------------- Upcoming ---------------- */}
          <section className={card}>
            <h2 className="font-heading text-lg text-[#3B2F27]">3. Active recurring schedules ({active.length})</h2>
            <p className="mt-1 text-sm text-[#6B5B4C]">
              Each schedule has at most one upcoming appointment. The next one is created automatically the day after a
              visit, once its payment has succeeded — no manual completion is needed.
            </p>
            {active.length === 0 && <p className="mt-2 text-sm text-[#6B5B4C]">No active schedules.</p>}
            <div className="mt-3 space-y-4">
              {active.map((s) => (
                <ScheduleCard key={s.scheduleId} s={s} busy={busy} run={run} />
              ))}
            </div>
          </section>

          {/* ---------------- Convert ---------------- */}
          <ConvertSection dashboard={dashboard} busy={busy} run={run} />

          {ended.length > 0 && (
            <section className={card}>
              <h2 className="font-heading text-lg text-[#3B2F27]">Ended schedules ({ended.length})</h2>
              <ul className="mt-3 space-y-1 text-sm text-[#6B5B4C]">
                {ended.map((s) => (
                  <li key={s.scheduleId}>
                    {s.customerName} — {s.frequency} — {s.scheduleId} ({s.completedCount} paid)
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

type RunFn = (key: string, url: string, init: RequestInit | undefined, reloadOnSuccess?: boolean) => Promise<void>;

function ScheduleCard({ s, busy, run, highlight = false }: { s: OwnerScheduleCard; busy: string | null; run: RunFn; highlight?: boolean }) {
  const a = s.appointment;
  return (
    <div className={`rounded-xl border p-4 ${highlight ? "border-[#E3C77E] bg-[#FBF3DC]" : "border-[#E7DECE] bg-[#FBF7EF]"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-[#3B2F27]">
          {s.customerName} <span className="font-normal text-[#6B5B4C]">· {s.email}</span>
        </p>
        <p className="text-xs text-[#8A7A6B]">
          {s.frequency} · {s.status} · full {formatCurrency(s.fullPriceTotal)} / recurring {formatCurrency(s.recurringPriceTotal)}
        </p>
      </div>
      <p className="mt-1 text-xs text-[#8A7A6B]">Schedule {s.scheduleId} · {s.completedCount} paid</p>

      {s.reviewReason && (
        <p className="mt-3 text-sm text-[#8A6A1E]">
          <strong>{s.reviewReason}</strong> — {s.reviewHelp}
        </p>
      )}
      {s.status === "Paused" && !s.reviewReason && (
        <p className="mt-3 text-sm text-[#8A6A1E]">This schedule is paused. Resume it or end it.</p>
      )}

      {a ? (
        <div className="mt-3 rounded-lg bg-white p-3 text-sm text-[#3B2F27]">
          <p>
            <strong>Appointment #{a.occurrenceNumber}</strong> — {a.serviceDateLabel} at {a.timeLabel} · {formatCurrency(a.totalPrice)}{" "}
            · {a.paymentStatus}
          </p>
          <p className="text-xs text-[#6B5B4C]">Booking {a.bookingId} · Cleaner: {a.assignment}</p>
          <p className="mt-1 text-xs text-[#6B5B4C]">{a.statusNote}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className={btnDanger}
              disabled={busy !== null || !a.canMarkUnperformed}
              title={a.canMarkUnperformed ? "" : "The charge has already been attempted — refund in Stripe instead."}
              onClick={() =>
                window.confirm("Mark this visit as NOT performed? It will be closed with no charge and the schedule moves on to its next regular date.") &&
                run(`unperformed:${a.bookingId}`, `/api/internal/bookings/${encodeURIComponent(a.bookingId)}/unperformed`, undefined)
              }
            >
              {busy === `unperformed:${a.bookingId}` ? "Working…" : "Mark unperformed"}
            </button>
          </div>
        </div>
      ) : (
        s.status === "Active" && (
          <p className="mt-3 text-sm text-[#6B5B4C]">
            No upcoming appointment.{" "}
            {s.nextRegularDate ? `Next regular date: ${formatReadableDate(s.nextRegularDate)}.` : ""}
          </p>
        )
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {s.canSkip && (
          <button
            type="button"
            className={btnQuiet}
            disabled={busy !== null}
            onClick={() =>
              window.confirm(
                `Skip the occurrence due ${s.nextRegularDate ? formatReadableDate(s.nextRegularDate) : "next"}? The series continues from the following regular date.`,
              ) && run(`skip:${s.scheduleId}`, `/api/internal/recurring-schedules/${encodeURIComponent(s.scheduleId)}/skip-occurrence`, undefined)
            }
          >
            {busy === `skip:${s.scheduleId}` ? "Working…" : "Skip this occurrence"}
          </button>
        )}
        {s.canResume && (
          <button
            type="button"
            className={btnPrimary}
            disabled={busy !== null}
            onClick={() => run(`resume:${s.scheduleId}`, `/api/internal/recurring-schedules/${encodeURIComponent(s.scheduleId)}/resume`, undefined)}
          >
            {busy === `resume:${s.scheduleId}` ? "Working…" : "Resume schedule"}
          </button>
        )}
        {s.canEnd && (
          <button
            type="button"
            className={btnDanger}
            disabled={busy !== null}
            onClick={() =>
              window.confirm(
                "End this recurring schedule? No further appointments will be created, and its upcoming appointment is cancelled under the normal cancellation policy (a late fee applies if it is within 24 hours).",
              ) && run(`end:${s.scheduleId}`, `/api/internal/recurring-schedules/${encodeURIComponent(s.scheduleId)}/end`, undefined)
            }
          >
            {busy === `end:${s.scheduleId}` ? "Working…" : "End schedule"}
          </button>
        )}
      </div>
    </div>
  );
}

function ConvertSection({ dashboard, busy, run }: { dashboard: OwnerDashboard; busy: string | null; run: RunFn }) {
  const [selected, setSelected] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const chosen = dashboard.convertible.find((c) => c.bookingId === selected) ?? null;

  return (
    <section className={card}>
      <h2 className="font-heading text-lg text-[#3B2F27]">4. Convert an existing booking ({dashboard.convertible.length})</h2>
      <p className="mt-1 text-sm text-[#6B5B4C]">
        Existing weekly / every-other-week / monthly bookings are <strong>not</strong> recurring schedules and are never
        converted automatically. Convert one only after the customer has confirmed they want automatic recurring
        cleanings. Its booked price, payment history and Stripe details are not changed.
      </p>
      {dashboard.convertible.length === 0 ? (
        <p className="mt-3 text-sm text-[#6B5B4C]">No existing recurring-labelled bookings are waiting to be converted.</p>
      ) : (
        <div className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="text-[#6B5B4C]">Booking</span>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#D8CBB4] bg-white px-3 py-2 text-sm text-[#3B2F27]"
            >
              <option value="">Select a booking…</option>
              {dashboard.convertible.map((c) => (
                <option key={c.bookingId} value={c.bookingId}>
                  {c.customerName} — {c.frequency} — {c.serviceDateLabel} — {formatCurrency(c.totalPrice)} — {c.bookingId}
                </option>
              ))}
            </select>
          </label>
          {chosen && !chosen.hasExactStartTime && (
            <p className="text-sm text-[#B14A2E]">
              This booking uses an old arrival window, not an exact start time. Reschedule it to an exact time first.
            </p>
          )}
          {chosen && chosen.hasExactStartTime && !chosen.completed && (
            <p className="text-xs text-[#6B5B4C]">
              Starts at {chosen.timeLabel}. The next appointment is created once this visit is marked complete.
            </p>
          )}
          <label className="flex items-start gap-2 text-sm text-[#3B2F27]">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 accent-[#3B2F27]" />
            <span>The customer has confirmed they want automatic recurring cleanings, billed to their saved card after each visit.</span>
          </label>
          <label className="block text-sm">
            <span className="text-[#6B5B4C]">How and when they confirmed (required)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Confirmed by email reply, 2026-10-14"
              maxLength={300}
              className="mt-1 w-full rounded-lg border border-[#D8CBB4] bg-white px-3 py-2 text-sm text-[#3B2F27]"
            />
          </label>
          <button
            type="button"
            className={btnPrimary}
            disabled={busy !== null || !chosen || !confirmed || note.trim().length === 0}
            onClick={() =>
              run("convert", "/api/internal/recurring-schedules/convert", {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bookingId: selected, customerConfirmed: confirmed, confirmationNote: note }),
              })
            }
          >
            {busy === "convert" ? "Converting…" : "Convert to a recurring schedule"}
          </button>
        </div>
      )}
    </section>
  );
}
