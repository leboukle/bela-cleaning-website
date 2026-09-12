import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { buildPageMetadata } from "@/lib/seo";

// No such page ever existed by design — rescheduling is an in-page state
// change on ManageBookingActions.tsx (see the sibling page.tsx), not a
// separate route; only /api/manage-booking/[token]/reschedule (a POST
// endpoint) lives at this path shape. This route exists solely to catch a
// customer, bookmark, or typed URL landing on the plausible-but-never-
// implemented "/reschedule" page path and send them to the real page
// instead of a 404 — no token validation or booking logic happens here,
// preserving the single token-resolution/eligibility chokepoint in
// manageBookingAccess.ts.
export const metadata: Metadata = {
  ...buildPageMetadata({
    title: "Manage Your Booking | BeLa Cleaning",
    description: "View, reschedule, or cancel your BeLa Cleaning appointment.",
    path: "/manage-booking",
  }),
  robots: { index: false, follow: false },
};

export default async function ManageBookingReschedulePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  redirect(`/manage-booking/${token}`);
}
