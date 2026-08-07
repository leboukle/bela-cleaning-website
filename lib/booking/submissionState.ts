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
      arrivalWindow: string;
      totalPrice: number;
      estimatedDurationMinutes: number;
    }
  | { status: "error"; message: string }
  | { status: "date-unavailable"; message: string };
