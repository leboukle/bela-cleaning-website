import type { BookingState } from "./types";

/**
 * Applies the customer's chosen appointment date. Picking a genuinely
 * different date clears any previously selected start time: that time was
 * chosen from the old date's availability, so it must never silently carry
 * over — the customer explicitly picks an available time for the new date
 * in the existing time step. No replacement time is ever selected here.
 * Re-selecting the same date leaves a still-valid time untouched.
 *
 * Availability itself is unchanged: the live list and the server's
 * checkExactTimeAvailability at submission remain the source of truth.
 */
export function withAppointmentDate(state: BookingState, dateKey: string): BookingState {
  if (state.appointmentDate === dateKey) return state;
  return { ...state, appointmentDate: dateKey, serviceStartTime: null };
}
