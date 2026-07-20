import type { Service } from "@/lib/services";
import ResponsiveImageSection from "./ResponsiveImageSection";

type ServiceCardProps = {
  service: Service;
  priority?: boolean;
};

export default function ServiceCard({ service, priority = false }: ServiceCardProps) {
  return (
    <article className="group flex flex-col">
      <ResponsiveImageSection
        image={service.image}
        aspectClassName="aspect-[4/3]"
        priority={priority}
        className="rounded-sm"
        sizes="(min-width: 1024px) 33vw, 100vw"
      />
      <div className="flex flex-1 flex-col pt-5">
        <h3 className="font-heading text-xl text-charcoal">{service.name}</h3>
        <p className="mt-2 text-warm-text leading-relaxed">{service.shortCopy}</p>
      </div>
    </article>
  );
}
