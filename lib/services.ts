import { images, type SiteImage } from "./images";
import type { ServiceType } from "./serviceDefinitions";

// Presentation-only metadata for the three service sections shared by the
// homepage teaser cards (ServiceCard) and the public Services page.
// Deliberately holds nothing about what a service includes or excludes —
// that content lives in exactly one place, serviceDefinitions.ts
// (getServiceScope), which the confirmation/reminder emails also consume,
// so none of these surfaces can drift out of sync with each other. `name`
// is this section's display heading — for the combined Move-In/Move-Out
// section it intentionally differs from either individual serviceType's
// own SERVICE_DEFINITIONS name (there is no single-type name for the
// combined section).
export type Service = {
  slug: string;
  name: string;
  shortCopy: string;
  serviceType: ServiceType;
  image: SiteImage;
};

export const services: Service[] = [
  {
    slug: "standard-cleaning",
    name: "Standard Cleaning",
    shortCopy: "Routine care for kitchens, bathrooms, bedrooms, and living areas.",
    serviceType: "standard",
    image: images.serviceStandard,
  },
  {
    slug: "deep-cleaning",
    name: "Deep Cleaning",
    shortCopy: "A more detailed reset for homes that need additional time and attention.",
    serviceType: "deep",
    image: images.serviceDeep,
  },
  {
    slug: "move-in-move-out-cleaning",
    name: "Move-In and Move-Out Cleaning",
    shortCopy: "A comprehensive clean designed for transitions, fresh starts, and empty spaces.",
    // Move-In and Move-Out Cleaning share identical scope copy (see
    // MOVE_IN_OUT_INCLUDES/EXCLUDES in serviceDefinitions.ts) — either
    // type's definition renders this combined section identically.
    serviceType: "move-in",
    image: images.serviceMoveInOut,
  },
];

export const addOns: string[] = [
  "Inside kitchen cabinets",
  "Inside refrigerator",
  "Inside oven",
  "Deep-cleaning upgrade",
  "Move-in or move-out service",
  "Interior windows where available",
  "Additional bathroom",
  "Heavy pet hair, if currently offered",
];
