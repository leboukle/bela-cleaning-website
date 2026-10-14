// Client-side UI state for a booking submission attempt against
// /api/booking. Mirrors bookingService.ts's typed result shape but lives
// here (not in a server-only file) since ReviewStep and BookingFlow are
// both client components and need to import it directly.
export type BookingSubmissionUiState =
  | { status: "idle" }
  | { status: "submitting" }
  | {
      status: "success";
      bookingId: string;
      serviceDate: string;
      serviceStartTime: string;
      totalPrice: number;
      estimatedDurationMinutes: number;
      // The saved booking's own pricing facts, as returned by the server
      // (fresh submission or idempotent replay). The confirmation renders
      // from these, never from whatever the browser's form state now holds.
      saved: {
        cleaningType: string;
        frequency: string;
        frequencyDiscount: number;
        quoteKind: "one-time" | "first-cleaning" | "follow-up" | "legacy";
      };
    }
  | { status: "error"; message: string }
  | { status: "date-unavailable"; message: string }
  | { status: "payment-setup-invalid"; message: string };
