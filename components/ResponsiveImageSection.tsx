import Image from "next/image";
import type { SiteImage } from "@/lib/images";

type ResponsiveImageSectionProps = {
  image: SiteImage;
  aspectClassName?: string;
  priority?: boolean;
  sizes?: string;
  className?: string;
};

export default function ResponsiveImageSection({
  image,
  aspectClassName = "aspect-[4/5]",
  priority = false,
  sizes = "(min-width: 1024px) 50vw, 100vw",
  className = "",
}: ResponsiveImageSectionProps) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl bg-soft-gray ${aspectClassName} ${className}`}
    >
      <Image
        src={image.src}
        alt={image.alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover transition-transform duration-700 ease-out motion-safe:group-hover:scale-[1.03]"
      />
    </div>
  );
}
