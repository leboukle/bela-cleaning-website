// SERVER-ONLY. Storage abstraction the booking domain talks to. Nothing
// above this interface (bookingService.ts, the API routes) knows or cares
// that Google Sheets is the current implementation — swapping in a real
// database later means writing one new class that implements this
// interface and changing a single wiring point, not touching the booking
// UI or the validation/pricing/availability logic at all.
import "server-only";
import type { BookingRecord } from "./types";

export type IdempotentBookingResult = {
  bookingId: string;
  totalPrice: number;
  estimatedDurationMinutes: number;
  serviceDate: string;
  arrivalWindow: string;
};

export interface BookingRepository {
  /** Appends exactly one row for a newly-accepted booking. */
  appendBooking(record: BookingRecord): Promise<void>;

  /** True if a booking with this exact ID already exists (collision check). */
  bookingIdExists(bookingId: string): Promise<boolean>;

  /**
   * Looks for a prior booking created from the same idempotency token,
   * within a bounded recent-row window (not the entire sheet history —
   * see googleSheetsRepository.ts for the documented tradeoff). Returns
   * enough of that booking's data to reconstruct a success response
   * without appending a duplicate row.
   */
  findRecentBookingByIdempotencyToken(token: string): Promise<IdempotentBookingResult | null>;
}
