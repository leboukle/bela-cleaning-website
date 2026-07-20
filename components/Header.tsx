"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { primaryNav } from "@/lib/nav";
import { businessConfig, CTA_LABEL } from "@/lib/config";
import PrimaryButton from "./PrimaryButton";
import MobileMenu from "./MobileMenu";

const MOBILE_MENU_ID = "mobile-menu";

export default function Header() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile menu on route change. Adjusting state during render
  // (rather than in an effect) avoids an extra render pass; this is the
  // pattern React recommends for resetting state when a prop changes.
  const [menuPathname, setMenuPathname] = useState(pathname);
  if (pathname !== menuPathname) {
    setMenuPathname(pathname);
    setMobileOpen(false);
  }

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 16);
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const transparent = isHome && !scrolled && !mobileOpen;
  const textColor = transparent ? "text-pure-white" : "text-charcoal";
  const surfaceClasses = transparent
    ? "bg-transparent border-transparent"
    : "bg-warm-white/95 backdrop-blur-sm border-soft-gray";

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-colors duration-300 ${surfaceClasses}`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className={`flex items-baseline gap-1.5 transition-colors duration-300 ${textColor}`}
        >
          <span className="font-heading text-2xl">BeLa</span>
          <span className="font-sans text-sm font-medium tracking-wide">Cleaning</span>
        </Link>

        <nav aria-label="Primary" className="hidden md:flex items-center gap-8">
          {primaryNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-sm font-medium transition-colors duration-300 hover:underline underline-offset-4 ${textColor}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:block">
          <PrimaryButton href={businessConfig.bookingUrl}>{CTA_LABEL}</PrimaryButton>
        </div>

        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-controls={MOBILE_MENU_ID}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          onClick={() => setMobileOpen((open) => !open)}
          className={`md:hidden inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-300 ${textColor}`}
        >
          {mobileOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
      </div>

      <MobileMenu
        id={MOBILE_MENU_ID}
        isOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
    </header>
  );
}
