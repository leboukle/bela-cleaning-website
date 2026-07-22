import type { Metadata } from "next";
import BookingFlow from "@/components/booking/BookingFlow";

// Internal prototype route — intentionally excluded from app/sitemap.ts and
// marked noindex/nofollow here as well (defense in depth) since it is not
// yet linked from anywhere on the live site.
export const metadata: Metadata = {
  title: "Booking Preview (Prototype) | BeLa Cleaning",
  description: "Internal prototype of a new BeLa Cleaning booking experience. Not yet available to customers.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function BookingPreviewPage() {
  return (
    <div className="min-h-screen bg-[#FBF7EF]">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14 lg:px-10 lg:py-16">
        <BookingFlow />
      </div>
    </div>
  );
}
