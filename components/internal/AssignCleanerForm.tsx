"use client";

import { useMemo, useState } from "react";
import { formatCurrency } from "@/lib/booking/calculate";
import { formatReadableDate, getScheduleDisplayLabel } from "@/lib/booking/schedule";
import { calculatePayoutAmount, STANDARD_CLEANER_PAYOUT_PERCENTAGE } from "@/lib/booking/cleanerPayout";
import type { AssignableBookingSummary } from "@/lib/booking/server/types";
import type { CleanerRecord } from "@/lib/booking/server/cleanerTypes";

type AssignCleanerFormProps = {
  bookings: AssignableBookingSummary[];
  cleaners: CleanerRecord[];
};

export default function AssignCleanerForm({ bookings, cleaners }: AssignCleanerFormProps) {
  const [bookingId, setBookingId] = useState("");
  const [cleanerId, setCleanerId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignBanner, setAssignBanner] = useState<{ kind: "success" | "warning" | "error"; message: string } | null>(null);

  const [completeBookingId, setCompleteBookingId] = useState("");
  const [completing, setCompleting] = useState(false);
  const [completeBanner, setCompleteBanner] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/internal/session", { method: "DELETE" });
    } finally {
      window.location.reload();
    }
  }

  const selectedBooking = useMemo(() => bookings.find((b) => b.bookingId === bookingId) ?? null, [bookings, bookingId]);
  const selectedCleaner = useMemo(() => cleaners.find((c) => c.cleanerId === cleanerId) ?? null, [cleaners, cleanerId]);
  const payoutPreview = selectedBooking && selectedCleaner ? calculatePayoutAmount(selectedBooking.chargeAmount) : null;

  async function handleAssign() {
    if (!bookingId || !cleanerId) return;
    setAssigning(true);
    setAssignBanner(null);
    try {
      const res = await fetch("/api/internal/cleaner-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, cleanerId }),
      });
      const body = await res.json();
      // "created-email-failed": the assignment itself succeeded (still
      // ok:true from the API, and the form still clears — there's
      // nothing more for BeLa to retry here) but the cleaner was never
      // actually notified, so this gets its own amber "needs follow-up"
      // treatment rather than looking identical to a clean success.
      const kind = !body.ok ? "error" : body.outcome === "created-email-failed" ? "warning" : "success";
      setAssignBanner({ kind, message: body.message ?? "Something went wrong." });
      if (body.ok) {
        setBookingId("");
        setCleanerId("");
      }
    } catch {
      setAssignBanner({ kind: "error", message: "Something went wrong. Please try again." });
    } finally {
      setAssigning(false);
    }
  }

  async function handleComplete() {
    if (!completeBookingId.trim()) return;
    setCompleting(true);
    setCompleteBanner(null);
    try {
      const res = await fetch(`/api/internal/bookings/${encodeURIComponent(completeBookingId.trim())}/complete`, {
        method: "POST",
      });
      const body = await res.json();
      setCompleteBanner({ kind: body.ok ? "success" : "error", message: body.message ?? "Something went wrong." });
      if (body.ok) setCompleteBookingId("");
    } catch {
      setCompleteBanner({ kind: "error", message: "Something went wrong. Please try again." });
    } finally {
      setCompleting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="text-sm font-medium text-[#8A7A6B] underline underline-offset-2 hover:text-[#6B5B4C] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loggingOut ? "Logging out…" : "Log out"}
        </button>
      </div>

      <section className="rounded-2xl border border-[#E7DECE] bg-white p-6 shadow-[0_1px_3px_-1px_rgba(59,47,39,0.08)]">
        <h2 className="font-heading text-lg text-[#3B2F27]">Assign a cleaner to a booking</h2>

        {assignBanner && (
          <div
            className={`mt-3 rounded-xl border p-3 text-sm ${
              assignBanner.kind === "success"
                ? "border-[#C9BCA6] bg-[#F1E9DC] text-[#3B2F27]"
                : assignBanner.kind === "warning"
                  ? "border-[#E3C77E] bg-[#FBF3DC] text-[#8A6A1E]"
                  : "border-[#E3B7A6] bg-[#FBEEE8] text-[#B14A2E]"
            }`}
          >
            {assignBanner.message}
          </div>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-[#6B5B4C]">Booking</span>
            <select
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#D8CBB4] bg-white px-3 py-2 text-sm text-[#3B2F27]"
            >
              <option value="">Select a booking…</option>
              {bookings.map((b) => (
                <option key={b.bookingId} value={b.bookingId}>
                  {b.bookingId} — {b.firstName} — {b.serviceDate}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-[#6B5B4C]">Cleaner</span>
            <select
              value={cleanerId}
              onChange={(e) => setCleanerId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#D8CBB4] bg-white px-3 py-2 text-sm text-[#3B2F27]"
            >
              <option value="">Select a cleaner…</option>
              {cleaners.map((c) => (
                <option key={c.cleanerId} value={c.cleanerId}>
                  {c.firstName} {c.lastName}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedBooking && (
          <div className="mt-4 rounded-xl border border-[#E7DECE] bg-[#FBF7EF] p-4 text-sm text-[#3B2F27]">
            <p>
              <span className="text-[#8A7A6B]">Customer: </span>
              {selectedBooking.firstName}
            </p>
            <p>
              <span className="text-[#8A7A6B]">Address: </span>
              {[selectedBooking.streetAddress, selectedBooking.apartmentOrUnit, `${selectedBooking.city}, ${selectedBooking.state} ${selectedBooking.zipCode}`]
                .filter((part) => part && part.trim().length > 0)
                .join(", ")}
            </p>
            <p>
              <span className="text-[#8A7A6B]">Service date: </span>
              {formatReadableDate(selectedBooking.serviceDate)} · {getScheduleDisplayLabel(selectedBooking)}
            </p>
            <p>
              <span className="text-[#8A7A6B]">Cleaning type: </span>
              {selectedBooking.cleaningType}
            </p>
            <p>
              <span className="text-[#8A7A6B]">Cleaning total: </span>
              {formatCurrency(selectedBooking.chargeAmount)}
            </p>
            {payoutPreview !== null && selectedCleaner && (
              <p className="mt-2 font-semibold text-[#1E5B3A]">
                Payout ({Math.round(STANDARD_CLEANER_PAYOUT_PERCENTAGE * 100)}%): {formatCurrency(payoutPreview)}
              </p>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={handleAssign}
          disabled={!bookingId || !cleanerId || assigning}
          className="mt-4 rounded-full bg-[#1E5B3A] px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#164B2E] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {assigning ? "Assigning…" : "Assign Cleaner"}
        </button>
      </section>

      <section className="rounded-2xl border border-[#E7DECE] bg-white p-6 shadow-[0_1px_3px_-1px_rgba(59,47,39,0.08)]">
        <h2 className="font-heading text-lg text-[#3B2F27]">Mark a booking complete</h2>
        <p className="mt-1 text-xs text-[#8A7A6B]">
          This confirms the cleaning happened and triggers the cleaner&rsquo;s payout statement. Enter the exact Booking ID.
        </p>

        {completeBanner && (
          <div
            className={`mt-3 rounded-xl border p-3 text-sm ${
              completeBanner.kind === "success" ? "border-[#C9BCA6] bg-[#F1E9DC] text-[#3B2F27]" : "border-[#E3B7A6] bg-[#FBEEE8] text-[#B14A2E]"
            }`}
          >
            {completeBanner.message}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="text-[#6B5B4C]">Booking ID</span>
            <input
              type="text"
              value={completeBookingId}
              onChange={(e) => setCompleteBookingId(e.target.value)}
              placeholder="BELA-20260101-ABCDEF"
              className="mt-1 w-64 rounded-lg border border-[#D8CBB4] bg-white px-3 py-2 text-sm text-[#3B2F27]"
            />
          </label>
          <button
            type="button"
            onClick={handleComplete}
            disabled={!completeBookingId.trim() || completing}
            className="rounded-full border-2 border-[#3B2F27] px-5 py-2.5 text-sm font-semibold text-[#3B2F27] transition-colors duration-150 hover:bg-[#F1E9DC] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {completing ? "Marking…" : "Mark Complete"}
          </button>
        </div>
      </section>
    </div>
  );
}
