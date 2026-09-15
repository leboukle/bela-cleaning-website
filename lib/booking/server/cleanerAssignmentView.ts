// SERVER-ONLY. Builds the cleaner-safe view of an assignment for the
// Accept/Decline page — an explicit field whitelist, mirroring
// manageBookingView.ts's role exactly. Never exposes record.email,
// record.mobile, or any Stripe/payment-processing field — this function
// never even receives the full BookingRecord's Stripe fields into scope
// beyond what it explicitly destructures below.
import "server-only";
import { ASSIGNMENT_STATUS } from "./cleanerSheetSchema";
import { describeExtras } from "./extrasDescription";
import { getScheduleDisplayLabel, formatReadableDate } from "@/lib/booking/schedule";
import type { AssignmentRecord } from "./cleanerTypes";
import type { BookingRecord } from "./types";

export type CleanerAssignmentView = {
  assignmentId: string;
  bookingId: string;
  status: string;
  customerFirstName: string;
  streetAddress: string;
  apartmentOrUnit: string;
  city: string;
  state: string;
  zipCode: string;
  serviceDateLabel: string;
  scheduleDisplayLabel: string;
  estimatedDurationMinutes: number;
  cleaningType: string;
  bedrooms: string;
  bathrooms: string;
  propertyType: string;
  squareFootage: string;
  extras: string[];
  someoneHome: string;
  specialInstructions: string;
  cleaningTotal: number;
  payoutPercentage: number;
  payoutAmount: number;
  responseDeadline: string;
  /** True only while the cleaner can still Accept/Decline — Pending and before the deadline. */
  canRespond: boolean;
};

export function buildCleanerAssignmentView(record: BookingRecord, assignment: AssignmentRecord, now: Date = new Date()): CleanerAssignmentView {
  const canRespond = assignment.status === ASSIGNMENT_STATUS.PENDING && now.getTime() < new Date(assignment.responseDeadline).getTime();

  return {
    assignmentId: assignment.assignmentId,
    bookingId: record.bookingId,
    status: assignment.status,
    customerFirstName: record.firstName,
    streetAddress: record.streetAddress,
    apartmentOrUnit: record.apartmentOrUnit,
    city: record.city,
    state: record.state,
    zipCode: record.zipCode,
    serviceDateLabel: formatReadableDate(record.serviceDate),
    scheduleDisplayLabel: getScheduleDisplayLabel(record),
    estimatedDurationMinutes: record.estimatedDurationMinutes,
    cleaningType: record.cleaningType,
    bedrooms: record.bedrooms,
    bathrooms: record.bathrooms,
    propertyType: record.propertyType,
    squareFootage: record.squareFootage,
    extras: describeExtras(record.extras),
    someoneHome: record.someoneHome,
    specialInstructions: record.specialInstructions,
    cleaningTotal: assignment.cleaningTotalSnapshot,
    payoutPercentage: assignment.payoutPercentageSnapshot,
    payoutAmount: assignment.payoutAmountSnapshot,
    responseDeadline: assignment.responseDeadline,
    canRespond,
  };
}
