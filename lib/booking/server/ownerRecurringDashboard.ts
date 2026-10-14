// SERVER-ONLY. Builds everything the owner's recurring-schedules page shows:
// a setup check (which sheet is configured, are the headers right), the
// schedules that need attention, each active schedule's single upcoming
// appointment with the owner actions that are valid for it, and the
// existing frequency-labelled bookings that could be converted.
//
// Read-only. Every action the page offers goes through the same internal
// endpoints and services as the rest of the system (see
// recurringScheduleService.ts) — this module only decides what to SHOW.
import "server-only";
import { BOOKING_STATUS, PAYMENT_STATUS, BOOKINGS_COLUMNS, columnLetter } from "./bookingsSheetSchema";
import { SCHEDULE_COLUMNS, SCHEDULE_EVENT_COLUMNS, SCHEDULE_STATUS, SCHEDULES_SHEET_NAME, SCHEDULE_EVENTS_SHEET_NAME, REVIEW_REASON, type RecurringScheduleRecord } from "./recurringScheduleSchema";
import type { BookingRepository, ScheduleBookingRow } from "./repository";
import type { RecurringScheduleRepository } from "./recurringScheduleRepository";
import type { CleanerAssignmentRepository } from "./cleanerRepository";
import { getFrequencyIdForLabel, getOccurrenceDateKey } from "@/lib/booking/recurrence";
import { formatReadableDate, getScheduleDisplayLabel } from "@/lib/booking/schedule";
import { getTodayDateKeyInTimezone } from "./dateUtils";

export type SetupCheckItem = { label: string; ok: boolean; detail: string };
export type SetupCheck = {
  spreadsheetTitle: string;
  spreadsheetIdSuffix: string;
  tabTitles: string[];
  items: SetupCheckItem[];
  allOk: boolean;
};

/** What the page needs from the sheet to verify its own setup — injected so it is testable. */
export type SheetProbe = {
  overview(): Promise<{ title: string; tabTitles: string[]; idSuffix: string }>;
  headerRow(tab: string): Promise<string[]>;
};

export async function runSetupCheck(probe: SheetProbe): Promise<SetupCheck> {
  const overview = await probe.overview();
  const items: SetupCheckItem[] = [];

  const hasTab = (tab: string) => overview.tabTitles.includes(tab);
  items.push({ label: 'Tab "Bookings"', ok: hasTab("Bookings"), detail: hasTab("Bookings") ? "found" : "missing" });
  items.push({
    label: `Tab "${SCHEDULES_SHEET_NAME}"`,
    ok: hasTab(SCHEDULES_SHEET_NAME),
    detail: hasTab(SCHEDULES_SHEET_NAME) ? "found" : "missing — create it and paste the 48 headers in row 1",
  });
  items.push({
    label: `Tab "${SCHEDULE_EVENTS_SHEET_NAME}"`,
    ok: hasTab(SCHEDULE_EVENTS_SHEET_NAME),
    detail: hasTab(SCHEDULE_EVENTS_SHEET_NAME) ? "found" : "missing — create it and paste the 7 headers in row 1",
  });

  if (hasTab("Bookings")) {
    const header = await probe.headerRow("Bookings");
    for (const column of ["Pricing Policy", "Recurring Schedule ID", "Occurrence Number"] as const) {
      const letter = columnLetter(column);
      const actual = header[BOOKINGS_COLUMNS.indexOf(column)] ?? "";
      items.push({
        label: `Bookings ${letter}1`,
        ok: actual === column,
        detail: actual === column ? `"${column}"` : `expected "${column}", found ${actual ? `"${actual}"` : "an empty cell"}`,
      });
    }
  }

  const checkRow = async (tab: string, expected: readonly string[], label: string) => {
    if (!hasTab(tab)) return;
    const header = await probe.headerRow(tab);
    const wrong = expected
      .map((name, i) => ({ name, i, actual: header[i] ?? "" }))
      .filter((c) => c.actual !== c.name)
      .slice(0, 3);
    items.push({
      label,
      ok: wrong.length === 0,
      detail:
        wrong.length === 0
          ? `all ${expected.length} headers match`
          : "mismatch: " + wrong.map((c) => `column ${c.i + 1} expected "${c.name}", found "${c.actual}"`).join("; "),
    });
  };
  await checkRow(SCHEDULES_SHEET_NAME, SCHEDULE_COLUMNS, `"${SCHEDULES_SHEET_NAME}" row 1`);
  await checkRow(SCHEDULE_EVENTS_SHEET_NAME, SCHEDULE_EVENT_COLUMNS, `"${SCHEDULE_EVENTS_SHEET_NAME}" row 1`);

  return {
    spreadsheetTitle: overview.title,
    spreadsheetIdSuffix: overview.idSuffix,
    tabTitles: overview.tabTitles,
    items,
    allOk: items.every((i) => i.ok),
  };
}

// ---------------------------------------------------------------------------

export type OwnerAppointment = {
  bookingId: string;
  occurrenceNumber: number;
  serviceDate: string;
  serviceDateLabel: string;
  timeLabel: string;
  totalPrice: number;
  paymentStatus: string;
  isFuture: boolean;
  assignment: string;
  /** Mark complete is always allowed; for a future visit the page asks for explicit confirmation. */
  canMarkComplete: boolean;
  /** Only before the charge has been attempted. */
  canMarkUnperformed: boolean;
};

export type OwnerScheduleCard = {
  scheduleId: string;
  customerName: string;
  email: string;
  frequency: string;
  status: string;
  reviewReason: string;
  reviewHelp: string;
  reviewSince: string;
  fullPriceTotal: number;
  recurringPriceTotal: number;
  /** The date the next appointment will be created on, if none is upcoming. */
  nextRegularDate: string | null;
  completedCount: number;
  appointment: OwnerAppointment | null;
  needsAttention: boolean;
  canSkip: boolean;
  canResume: boolean;
  canEnd: boolean;
};

export type ConvertibleBooking = {
  bookingId: string;
  customerName: string;
  email: string;
  frequency: string;
  serviceDateLabel: string;
  timeLabel: string;
  totalPrice: number;
  completed: boolean;
  hasExactStartTime: boolean;
};

export type OwnerDashboard = {
  todayDateKey: string;
  schedules: OwnerScheduleCard[];
  convertible: ConvertibleBooking[];
};

export const REVIEW_HELP: Record<string, string> = {
  [REVIEW_REASON.BLACKOUT]:
    "The next appointment falls on a blacked-out date. Remove the blackout row (it is then created automatically within 30 minutes, or press “Run recurring check now”), or skip this occurrence.",
  [REVIEW_REASON.UNAVAILABLE]:
    "The next appointment's date/time is at capacity. Free the capacity (it is then created automatically), or skip this occurrence.",
  [REVIEW_REASON.TOO_SOON]:
    "The next regular date is too close (or already past) for the 120-hour booking lead time. It cannot be created as scheduled — skip this occurrence to continue from the following regular date.",
  [REVIEW_REASON.COMPLETION_MISSING]:
    "A visit ended more than 24 hours ago and was never marked complete, so the next appointment has not been created. Mark it complete — or mark it unperformed if the visit did not happen.",
  [REVIEW_REASON.PAYMENT_FINAL_FAILURE]:
    "The latest appointment's payment failed for good, so generation is paused. Contact the customer; then Resume (same saved card) or End the schedule.",
  [REVIEW_REASON.DUPLICATE_DETECTED]: "A duplicate appointment was detected. It was voided automatically; review the schedule.",
  [REVIEW_REASON.GENERATION_ERROR]: "The schedule could not be processed. Check its frequency and details.",
};

function isOpen(row: ScheduleBookingRow): boolean {
  return row.bookingStatus !== BOOKING_STATUS.CANCELLED && !row.completedAt;
}

export async function buildOwnerDashboard(deps: {
  bookings: BookingRepository & {
    listRecurringLabelledUnconverted?: () => Promise<
      Array<{
        bookingId: string;
        firstName: string;
        lastName: string;
        email: string;
        frequency: string;
        serviceDate: string;
        serviceStartTime: string;
        arrivalWindow: string;
        totalPrice: number;
        completedAt: string;
      }>
    >;
  };
  schedules: RecurringScheduleRepository;
  assignments: Pick<CleanerAssignmentRepository, "getLatestAssignmentForBooking">;
  timezone: string;
  now?: Date;
}): Promise<OwnerDashboard> {
  const now = deps.now ?? new Date();
  const todayDateKey = getTodayDateKeyInTimezone(deps.timezone);
  const all = await deps.schedules.listSchedules();

  const cards: OwnerScheduleCard[] = [];
  for (const schedule of all) {
    cards.push(await buildCard(schedule, deps, todayDateKey));
  }
  // Needs-attention first, then Active, then Ended.
  const rank = (c: OwnerScheduleCard) => (c.needsAttention ? 0 : c.status === SCHEDULE_STATUS.ACTIVE ? 1 : c.status === SCHEDULE_STATUS.PAUSED ? 0 : 2);
  cards.sort((a, b) => rank(a) - rank(b));

  const convertibleRows = (await deps.bookings.listRecurringLabelledUnconverted?.()) ?? [];
  const convertible = convertibleRows.map<ConvertibleBooking>((b) => ({
    bookingId: b.bookingId,
    customerName: `${b.firstName} ${b.lastName}`.trim(),
    email: b.email,
    frequency: b.frequency,
    serviceDateLabel: b.serviceDate ? formatReadableDate(b.serviceDate) : "—",
    timeLabel: getScheduleDisplayLabel({ serviceStartTime: b.serviceStartTime, arrivalWindow: b.arrivalWindow }),
    totalPrice: b.totalPrice,
    completed: Boolean(b.completedAt),
    hasExactStartTime: Boolean(b.serviceStartTime),
  }));

  void now;
  return { todayDateKey, schedules: cards, convertible };
}

async function buildCard(
  schedule: RecurringScheduleRecord,
  deps: Parameters<typeof buildOwnerDashboard>[0],
  todayDateKey: string,
): Promise<OwnerScheduleCard> {
  const rows = deps.bookings.listScheduleBookings ? await deps.bookings.listScheduleBookings(schedule.scheduleId) : [];
  // canonical = first row per occurrence number
  const seen = new Set<number>();
  const canonical = rows.filter((r) => {
    if (r.occurrenceNumber <= 0 || seen.has(r.occurrenceNumber)) return false;
    seen.add(r.occurrenceNumber);
    return true;
  });

  const open = canonical.filter(isOpen).sort((a, b) => a.occurrenceNumber - b.occurrenceNumber)[0] ?? null;
  let appointment: OwnerAppointment | null = null;
  if (open && schedule.status !== SCHEDULE_STATUS.ENDED) {
    const latest = await deps.assignments.getLatestAssignmentForBooking(open.bookingId);
    appointment = {
      bookingId: open.bookingId,
      occurrenceNumber: open.occurrenceNumber,
      serviceDate: open.serviceDate,
      serviceDateLabel: formatReadableDate(open.serviceDate),
      timeLabel: getScheduleDisplayLabel({ serviceStartTime: open.serviceStartTime, arrivalWindow: "" }),
      totalPrice: open.chargeAmount,
      paymentStatus: open.paymentStatus,
      isFuture: open.serviceDate > todayDateKey,
      assignment: latest ? `${latest.cleanerName} — ${latest.status}` : "Not assigned",
      canMarkComplete: true,
      canMarkUnperformed: open.paymentStatus === PAYMENT_STATUS.SCHEDULED,
    };
  }

  const frequencyId = getFrequencyIdForLabel(schedule.frequency);
  const highest = canonical.reduce((m, r) => Math.max(m, r.occurrenceNumber), 0);
  const nextN = Math.max(schedule.nextOccurrenceNumber, highest + 1);
  const nextRegularDate =
    schedule.status === SCHEDULE_STATUS.ACTIVE && !open && frequencyId && frequencyId !== "one-time"
      ? getOccurrenceDateKey(schedule.anchorDate, frequencyId, nextN)
      : null;

  const needsAttention = schedule.status === SCHEDULE_STATUS.PAUSED || schedule.reviewReason !== "";
  return {
    scheduleId: schedule.scheduleId,
    customerName: `${schedule.firstName} ${schedule.lastName}`.trim(),
    email: schedule.email,
    frequency: schedule.frequency,
    status: schedule.status,
    reviewReason: schedule.reviewReason,
    reviewHelp: schedule.reviewReason ? (REVIEW_HELP[schedule.reviewReason] ?? "Review this schedule.") : "",
    reviewSince: schedule.reviewSince,
    fullPriceTotal: schedule.fullPriceTotal,
    recurringPriceTotal: schedule.recurringPriceTotal,
    nextRegularDate,
    completedCount: canonical.filter((r) => r.bookingStatus !== BOOKING_STATUS.CANCELLED && Boolean(r.completedAt)).length,
    appointment,
    needsAttention,
    canSkip: schedule.status !== SCHEDULE_STATUS.ENDED && !open,
    canResume: schedule.status === SCHEDULE_STATUS.PAUSED,
    canEnd: schedule.status !== SCHEDULE_STATUS.ENDED,
  };
}
