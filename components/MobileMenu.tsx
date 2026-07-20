import Link from "next/link";
import { primaryNav } from "@/lib/nav";
import { businessConfig, CTA_LABEL } from "@/lib/config";
import PrimaryButton from "./PrimaryButton";

type MobileMenuProps = {
  id: string;
  isOpen: boolean;
  onClose: () => void;
};

export default function MobileMenu({ id, isOpen, onClose }: MobileMenuProps) {
  return (
    <div
      id={id}
      inert={!isOpen}
      className={`md:hidden overflow-hidden bg-warm-white border-b border-soft-gray transition-[max-height,opacity] duration-300 ease-out ${
        isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
      }`}
    >
      <nav aria-label="Mobile" className="flex flex-col gap-1 px-6 pb-6 pt-2">
        {primaryNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            className="py-3 text-base font-medium text-charcoal border-b border-soft-gray last:border-b-0"
          >
            {item.label}
          </Link>
        ))}
        <div className="pt-4">
          <PrimaryButton href={businessConfig.bookingUrl} fullWidth onClick={onClose}>
            {CTA_LABEL}
          </PrimaryButton>
        </div>
      </nav>
    </div>
  );
}
