// SERVER-ONLY. Shared constants/type for the Milestone 4 notification
// status columns — kept separate from bookingsSheetSchema.ts (which owns
// column *names*/order) since this is about the *values* written into
// those columns.
import "server-only";

export const NOTIFICATION_STATUS = {
  SENT: "Sent",
  FAILED: "Failed",
} as const;

export type NotificationStatusUpdate = {
  customerConfirmationStatus: string;
  internalNotificationStatus: string;
  notificationAttemptAt: string;
};
