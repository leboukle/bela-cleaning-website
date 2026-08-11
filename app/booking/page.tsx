import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import BookingFlow from "@/components/booking/BookingFlow";

export const metadata: Metadata = buildPageMetadata({
  title: "Book a Cleaning | BeLa Cleaning",
  description:
    "Book residential cleaning in Jersey City, Hoboken, Newark, and nearby communities. Get an instant price, choose your appointment, and reserve your visit online.",
  path: "/booking",
});

export default function BookingPage() {
  return (
    <div className="min-h-screen bg-[#FBF7EF]">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14 lg:px-10 lg:py-16">
        <BookingFlow />
      </div>
    </div>
  );
}
