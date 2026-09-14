// SERVER-ONLY. URL building for the cleaner-assignment Accept/Decline
// page. Token generation/hashing/comparison is deliberately NOT
// duplicated here — manageToken.ts's generateManageToken/hashManageToken/
// manageTokenHashesMatch/isPlausibleManageToken are already fully generic
// (256-bit random + SHA-256 + timing-safe compare, nothing
// booking-specific in their implementation) and are reused as-is by
// assignmentService.ts. This module only adds the one thing that
// genuinely differs: the URL path.
import "server-only";
import { businessConfig } from "@/lib/config";

// Mirrors manageToken.ts's getManageBookingBaseUrl exactly — Preview
// deployments need their links to point back at the stable Preview
// alias; Production never needs to set this and falls back to
// businessConfig.websiteUrl unchanged.
function getCleanerAssignmentBaseUrl(): string {
  const override = process.env.MANAGE_BOOKING_BASE_URL?.trim().replace(/\/+$/, "");
  return override && override.length > 0 ? override : businessConfig.websiteUrl;
}

/** The full, absolute cleaner-assignment page URL for a raw token. */
export function buildCleanerAssignmentUrl(token: string): string {
  return `${getCleanerAssignmentBaseUrl()}/cleaner-assignment/${token}`;
}
