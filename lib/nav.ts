export type NavItem = {
  label: string;
  href: string;
  external?: boolean;
};

// Centralized primary navigation, shared by the header and footer.
export const primaryNav: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Services", href: "/services" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/about#contact" },
];
