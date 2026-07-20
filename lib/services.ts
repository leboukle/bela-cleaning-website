import { images, type SiteImage } from "./images";

export type Service = {
  slug: string;
  name: string;
  shortCopy: string;
  description: string;
  focusAreas: string[];
  note: string;
  image: SiteImage;
};

export const services: Service[] = [
  {
    slug: "standard-cleaning",
    name: "Standard Cleaning",
    shortCopy:
      "Routine care for kitchens, bathrooms, bedrooms, and living areas.",
    description:
      "Designed for regularly maintained homes that need dependable routine care.",
    focusAreas: [
      "Kitchen surfaces",
      "Exterior of appliances",
      "Sinks and countertops",
      "Bathroom surfaces",
      "Toilets, tubs, and showers",
      "Bedroom surfaces",
      "Living and dining areas",
      "Dusting accessible surfaces",
      "Vacuuming",
      "Mopping",
    ],
    note: "Final inclusions are based on the selections and service details shown during online booking.",
    image: images.serviceStandard,
  },
  {
    slug: "deep-cleaning",
    name: "Deep Cleaning",
    shortCopy:
      "A more detailed reset for homes that need additional time and attention.",
    description:
      "A more detailed service for homes that have not been professionally cleaned recently or need additional attention beyond routine upkeep.",
    focusAreas: [
      "Standard-cleaning tasks",
      "More detailed surface attention",
      "Additional buildup removal",
      "Baseboards where accessible",
      "Doors and trim",
      "Detailed bathroom care",
      "Detailed kitchen care",
      "Additional time for high-use areas",
    ],
    note: "The booking platform will show the available selections and add-ons for your home.",
    image: images.serviceDeep,
  },
  {
    slug: "move-in-move-out-cleaning",
    name: "Move-In and Move-Out Cleaning",
    shortCopy:
      "A comprehensive clean designed for transitions, fresh starts, and empty spaces.",
    description:
      "A detailed service for empty or mostly empty homes during a move, turnover, or fresh start.",
    focusAreas: [
      "Empty kitchen cabinets and drawers when selected",
      "Bathroom fixtures and surfaces",
      "Interior surfaces",
      "Floors",
      "Closets",
      "Baseboards",
      "Accessible shelving",
      "Empty rooms",
      "Selected appliance interiors when added",
    ],
    note: "Availability and pricing are shown during booking.",
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
