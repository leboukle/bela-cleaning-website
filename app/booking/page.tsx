import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import BookingFlow from "@/components/booking/BookingFlow";

export const metadata: Metadata = buildPageMetadata({
  title: "Book a Cleaning | BeLa Cleaning",
  description:
    "Book residential cleaning across Northern New Jersey, including Jersey City, Hoboken, and Newark. Get an instant price, choose your appointment, and reserve your visit online.",
  path: "/booking",
});

// `?next=<token>` carries the secret Manage Booking token of an earlier
// booking (from that booking's "Book your next cleaning" link). It is only
// passed through to the flow, which asks the server whether it qualifies —
// it is never interpreted here or trusted by the browser.
export default async function BookingPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  const followUpToken = typeof next === "string" ? next : null;

  return (
    <div className="min-h-screen bg-[#FBF7EF]">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14 lg:px-10 lg:py-16">
        <BookingFlow followUpToken={followUpToken} />
      </div>
    </div>
  );
}
