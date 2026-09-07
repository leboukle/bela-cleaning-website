import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { getManageBookingView } from "@/lib/booking/server/manageBookingAccess";
import { GoogleSheetsBookingRepository } from "@/lib/booking/server/googleSheetsRepository";
import { NotificationService } from "@/lib/booking/server/notificationService";
import { GmailApiTransport } from "@/lib/booking/server/email/gmailTransport";
import ManageBookingActions from "@/components/manageBooking/ManageBookingActions";
import { businessConfig } from "@/lib/config";

// robots: noindex — this path segment carries a per-booking access token in
// the URL and must never be crawled, cached, or surfaced in search results.
export const metadata: Metadata = {
  ...buildPageMetadata({
    title: "Manage Your Booking | BeLa Cleaning",
    description: "View, reschedule, or cancel your BeLa Cleaning appointment.",
    path: "/manage-booking",
  }),
  robots: { index: false, follow: false },
};

const repository = new GoogleSheetsBookingRepository();
const notificationService = new NotificationService(new GmailApiTransport());

export default async function ManageBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let result;
  try {
    result = await getManageBookingView(token, repository, notificationService);
  } catch {
    result = { ok: false as const };
  }

  return (
    <div className="min-h-screen bg-[#FBF7EF]">
      <div className="mx-auto max-w-2xl px-5 py-10 sm:px-8 sm:py-14 lg:px-10 lg:py-16">
        {result.ok ? (
          <ManageBookingActions token={token} initialBooking={result.view} />
        ) : (
          <div className="rounded-2xl border border-[#E7DECE] bg-white p-7 text-center shadow-[0_1px_3px_-1px_rgba(59,47,39,0.08)]">
            <h1 className="font-heading text-2xl text-[#3B2F27]">This link is invalid or has expired</h1>
            <p className="mt-3 text-sm text-[#6B5B4C]">
              Please check the link from your booking confirmation email, or contact us for help managing your
              appointment.
            </p>
            <p className="mt-6 text-sm text-[#8A7A6B]">
              <a href={`mailto:${businessConfig.email}`} className="underline underline-offset-2 hover:text-[#6B5B4C]">
                {businessConfig.email}
              </a>{" "}
              or{" "}
              <a href={businessConfig.phoneHref} className="underline underline-offset-2 hover:text-[#6B5B4C]">
                {businessConfig.phoneDisplay}
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
