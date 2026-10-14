// Internal, BeLa-only operational page for automatic recurring appointments:
// everything the owner needs day to day without sending API requests by hand
// — a setup check, schedules that need attention (skip / resume / end),
// each schedule's upcoming appointment (mark complete / mark unperformed),
// converting an existing booking after the customer confirms, and a manual
// "run the check now". Same structural gate as /internal/assign-cleaner: an
// unauthenticated request's HTML contains only the access-code form.
import type { Metadata } from "next";
import Link from "next/link";
import { hasValidAdminSession } from "@/lib/booking/server/adminAccess";
import { GoogleSheetsBookingRepository } from "@/lib/booking/server/googleSheetsRepository";
import { GoogleSheetsCleanerRepository } from "@/lib/booking/server/googleCleanerRepository";
import { GoogleRecurringScheduleRepository } from "@/lib/booking/server/googleRecurringScheduleRepository";
import { getRange, getSpreadsheetOverview } from "@/lib/booking/server/sheetsClient";
import { getBookingSettings } from "@/lib/booking/server/settings";
import { buildOwnerDashboard, runSetupCheck, type OwnerDashboard, type SetupCheck } from "@/lib/booking/server/ownerRecurringDashboard";
import RecurringOwnerPanel from "@/components/internal/RecurringOwnerPanel";
import AdminLoginForm from "@/components/internal/AdminLoginForm";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const bookings = new GoogleSheetsBookingRepository();
const schedules = new GoogleRecurringScheduleRepository();
const assignments = new GoogleSheetsCleanerRepository();

export default async function RecurringOwnerPage() {
  const authenticated = await hasValidAdminSession();
  return (
    <div className="min-h-screen bg-[#FBF7EF]">
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        <h1 className="font-heading text-2xl text-[#3B2F27]">Recurring cleanings</h1>
        <p className="mt-1 text-sm text-[#6B5B4C]">Internal BeLa Cleaning tool — not for customer or cleaner use.</p>
        <p className="mt-2 text-sm">
          <Link href="/internal/assign-cleaner" className="underline underline-offset-2 text-[#6B5B4C] hover:text-[#3B2F27]">
            Assign a cleaner / mark a booking complete →
          </Link>
        </p>
        <div className="mt-8">{authenticated ? <AuthenticatedDashboard /> : <AdminLoginForm />}</div>
      </div>
    </div>
  );
}

async function AuthenticatedDashboard() {
  let setup: SetupCheck | null = null;
  let setupError: string | null = null;
  try {
    setup = await runSetupCheck({
      overview: getSpreadsheetOverview,
      headerRow: async (tab) => ((await getRange(`${tab}!1:1`))[0] ?? []).map(String),
    });
  } catch {
    setupError = "Couldn't read the spreadsheet to check its setup. Check the Sheets connection and try again.";
  }

  let dashboard: OwnerDashboard | null = null;
  let dashboardError: string | null = null;
  if (setup?.allOk) {
    try {
      const settings = await getBookingSettings();
      dashboard = await buildOwnerDashboard({ bookings, schedules, assignments, timezone: settings.timezone });
    } catch {
      dashboardError = "Couldn't load the schedules. Try again in a moment.";
    }
  }

  return <RecurringOwnerPanel setup={setup} setupError={setupError} dashboard={dashboard} dashboardError={dashboardError} />;
}
