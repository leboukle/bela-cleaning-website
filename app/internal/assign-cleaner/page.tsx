// Internal, BeLa-only operational page — deliberately NOT a general admin
// portal (see architecture report §4/§9). Fixed, permanent path
// (/internal/assign-cleaner) — the admin secret is NEVER part of this
// URL. An unauthenticated visitor sees only a minimal access-code form
// (AdminLoginForm); no booking, cleaner, or other internal data is
// fetched or rendered until a valid session cookie is present (see
// adminAccess.ts's hasValidAdminSession) — the two are structurally
// separate branches below, not a client-side hide/show, so an
// unauthenticated request's server-rendered HTML never contains that data.
import type { Metadata } from "next";
import { hasValidAdminSession } from "@/lib/booking/server/adminAccess";
import { listAssignableBookings } from "@/lib/booking/server/assignmentService";
import { GoogleSheetsBookingRepository } from "@/lib/booking/server/googleSheetsRepository";
import { GoogleSheetsCleanerRepository } from "@/lib/booking/server/googleCleanerRepository";
import { getBookingSettings } from "@/lib/booking/server/settings";
import { getTodayDateKeyInTimezone } from "@/lib/booking/server/dateUtils";
import AssignCleanerForm from "@/components/internal/AssignCleanerForm";
import AdminLoginForm from "@/components/internal/AdminLoginForm";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const bookingRepository = new GoogleSheetsBookingRepository();
const assignmentRepository = new GoogleSheetsCleanerRepository();

export default async function AssignCleanerPage() {
  const authenticated = await hasValidAdminSession();

  return (
    <div className="min-h-screen bg-[#FBF7EF]">
      <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <h1 className="font-heading text-2xl text-[#3B2F27]">Assign a cleaner</h1>
        <p className="mt-1 text-sm text-[#6B5B4C]">Internal BeLa Cleaning tool — not for customer or cleaner use.</p>
        <div className="mt-8">{authenticated ? <AuthenticatedDashboard /> : <AdminLoginForm />}</div>
      </div>
    </div>
  );
}

async function AuthenticatedDashboard() {
  const settings = await getBookingSettings();
  const todayDateKey = getTodayDateKeyInTimezone(settings.timezone);

  const [bookings, cleaners] = await Promise.all([
    listAssignableBookings(bookingRepository, assignmentRepository, todayDateKey),
    assignmentRepository.getActiveCleaners(),
  ]);

  return <AssignCleanerForm bookings={bookings} cleaners={cleaners} />;
}
