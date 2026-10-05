// Central business configuration. All components should read from this file
// rather than hard-coding business details, so a change only needs to happen
// once.

export const businessConfig = {
  businessName: "BeLa Cleaning",
  websiteUrl: "https://www.belacleaning.com",
  // Site-relative path to BeLa's own booking experience (app/booking).
  // Every "Book Cleaning" button reads this — PrimaryButton renders an
  // internal Link for a path like this one, an external <a> only if the
  // value ever starts with "http".
  bookingUrl: "/booking",
  email: "info@belacleaning.com",
  phoneDisplay: "(551) 225-0276",
  phoneHref: "tel:+15512250276",
  customerServiceHours: "Monday–Friday, 8:00 a.m.–5:00 p.m.",
  customerServiceDays: "Monday through Friday",
  customerServiceTime: "8:00 a.m. to 5:00 p.m.",
  onlineBookingHours: "Available 24 hours a day, 7 days a week.",
  onlineBookingHoursShort: "Available 24/7",
  // Marketing/display copy only. Which addresses can actually book online is
  // decided exclusively by lib/booking/serviceArea.ts (ZIP eligibility).
  serviceAreas: ["Jersey City", "Hoboken", "Bayonne", "Weehawken", "Newark", "Nearby communities"],
  serviceAreaSentence:
    "Reliable residential cleaning throughout Jersey City, Hoboken, Bayonne, Weehawken, Newark and communities along the PATH and Hudson-Bergen Light Rail corridors.",
} as const;

export const CTA_LABEL = "Book Cleaning";
