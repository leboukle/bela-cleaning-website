// SERVER-ONLY. The one place that knows a booking's real-world start time
// — shared by Milestone 5's scheduled-charge calculation and Milestone 6's
// cancellation/reschedule timing rules, so both always agree on "when does
// this booking actually start." Extended by the Milestone 6 amendment to
// resolve either an exact Service Start Time (new bookings) or, for
// legacy rows, the coarser Arrival Window label — see
// resolveRecordStartSpec, the one chokepoint every timing-sensitive
// consumer (cancellationPolicy.ts, scheduledCharge.ts, reminderService.ts,
// manageBookingView.ts, the email templates) calls instead of branching on
// "is this an exact-time or legacy booking" themselves.
import "server-only";
import type { ArrivalWindowId } from "@/lib/booking/types";
import { getArrivalWindowIdByLabel, isPlausibleExactTimeFormat } from "@/lib/booking/schedule";
import { zonedWallTimeToUtc } from "./timezone";

export class ServiceTimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceTimeError";
  }
}

export type ServiceStartSpec = { hour: number; minute: number };

// 24-hour clock, local to the business's timezone. Deliberately a small
// server-only lookup rather than added to lib/booking/schedule.ts's
// client-facing ARRIVAL_WINDOWS array — this data is a server-side timing
// concern, not something the browser needs (the display label's time
// range already conveys the same start time to the customer). Only ever
// consulted for legacy (pre-amendment) bookings — see
// resolveRecordStartSpec.
const ARRIVAL_WINDOW_START_TIME: Record<ArrivalWindowId, ServiceStartSpec> = {
  morning: { hour: 8, minute: 0 },
  midday: { hour: 10, minute: 0 },
  "early-afternoon": { hour: 12, minute: 0 },
  afternoon: { hour: 14, minute: 0 },
};

export function arrivalWindowStartSpec(arrivalWindow: ArrivalWindowId): ServiceStartSpec {
  return ARRIVAL_WINDOW_START_TIME[arrivalWindow];
}

/**
 * The one resolver every consumer of a *persisted* booking's start time
 * should call. Prefers the exact `serviceStartTime` ("HH:00", Milestone 6
 * amendment) when populated; falls back to the legacy `arrivalWindow`
 * label lookup otherwise. A row is never expected to have both populated
 * (new bookings never write Arrival Window; a reschedule always clears it
 * — see reschedulingService.ts), but if a row somehow does, the exact time
 * wins, since it's the more specific, newer field.
 */
export function resolveRecordStartSpec(record: { serviceStartTime: string; arrivalWindow: string }): ServiceStartSpec {
  if (record.serviceStartTime) {
    if (!isPlausibleExactTimeFormat(record.serviceStartTime)) {
      throw new ServiceTimeError(`Malformed Service Start Time: "${record.serviceStartTime}".`);
    }
    return { hour: Number(record.serviceStartTime.slice(0, 2)), minute: 0 };
  }
  const arrivalWindowId = getArrivalWindowIdByLabel(record.arrivalWindow);
  if (!arrivalWindowId) {
    throw new ServiceTimeError(`Unknown arrival window label: "${record.arrivalWindow}".`);
  }
  return arrivalWindowStartSpec(arrivalWindowId);
}

/** The real-world UTC instant a booking's service starts, DST-safe. */
export function calculateServiceStart(serviceDateKey: string, spec: ServiceStartSpec, timezone: string): Date {
  const [year, month, day] = serviceDateKey.split("-").map(Number);
  return zonedWallTimeToUtc(year, month, day, spec.hour, spec.minute, timezone);
}
