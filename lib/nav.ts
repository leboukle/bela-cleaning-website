export type NavItem = {
  label: string;
  href: string;
  external?: boolean;
};

// Centralized primary navigation, shared by the header and footer.
// "Book Cleaning" is intentionally not listed here — it is always rendered
// as a distinct CTA button, not a plain text nav link.
export const primaryNav: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Services", href: "/services" },
  { label: "Work With Us", href: "/work-with-us" },
];
