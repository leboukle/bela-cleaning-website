import Link from "next/link";
import type { ReactNode } from "react";

type PrimaryButtonProps = {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "inverted";
  fullWidth?: boolean;
  className?: string;
  onClick?: () => void;
};

const baseClasses =
  "inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-sm font-medium tracking-wide transition-colors duration-200";

const variantClasses: Record<NonNullable<PrimaryButtonProps["variant"]>, string> = {
  primary:
    "bg-deep-green text-pure-white hover:bg-charcoal",
  secondary:
    "border border-charcoal text-charcoal hover:bg-charcoal hover:text-pure-white",
  inverted:
    "bg-pure-white text-deep-green hover:bg-soft-gray",
};

export default function PrimaryButton({
  href,
  children,
  variant = "primary",
  fullWidth = false,
  className = "",
  onClick,
}: PrimaryButtonProps) {
  const classes = [
    baseClasses,
    variantClasses[variant],
    fullWidth ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const isExternal = href.startsWith("http");

  if (isExternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={classes}
        onClick={onClick}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={classes} onClick={onClick}>
      {children}
    </Link>
  );
}
