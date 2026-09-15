import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { getCleanerAssignmentView } from "@/lib/booking/server/cleanerAssignmentAccess";
import { GoogleSheetsBookingRepository } from "@/lib/booking/server/googleSheetsRepository";
import { GoogleSheetsCleanerRepository } from "@/lib/booking/server/googleCleanerRepository";
import CleanerAssignmentActions from "@/components/cleanerAssignment/CleanerAssignmentActions";
import { businessConfig } from "@/lib/config";

// robots: noindex — this path segment carries a per-assignment access
// token in the URL and must never be crawled, cached, or surfaced in
// search results. Mirrors app/manage-booking/[token]/page.tsx.
export const metadata: Metadata = {
  ...buildPageMetadata({
    title: "Cleaning Assignment | BeLa Cleaning",
    description: "Review and respond to your BeLa Cleaning assignment.",
    path: "/cleaner-assignment",
  }),
  robots: { index: false, follow: false },
};

const bookingRepository = new GoogleSheetsBookingRepository();
const assignmentRepository = new GoogleSheetsCleanerRepository();

export default async function CleanerAssignmentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let result;
  try {
    result = await getCleanerAssignmentView(token, bookingRepository, assignmentRepository);
  } catch {
    result = { ok: false as const };
  }

  return (
    <div className="min-h-screen bg-[#FBF7EF]">
      <div className="mx-auto max-w-2xl px-5 py-10 sm:px-8 sm:py-14 lg:px-10 lg:py-16">
        {result.ok ? (
          <CleanerAssignmentActions token={token} initialAssignment={result.view} />
        ) : (
          <div className="rounded-2xl border border-[#E7DECE] bg-white p-7 text-center shadow-[0_1px_3px_-1px_rgba(59,47,39,0.08)]">
            <h1 className="font-heading text-2xl text-[#3B2F27]">This link is invalid or has expired</h1>
            <p className="mt-3 text-sm text-[#6B5B4C]">
              Please check the link from your assignment email, or contact BeLa Cleaning directly.
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
