import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { RevealSection } from "@/components/storefront/reveal-section";

/**
 * Two large photographs side by side, each with a caption and an arrow link.
 *
 * The reference site's signature block, rebuilt from measurement: 4:5 images at
 * 720×900 on desktop and 5:7 on a phone, a 20px caption beneath, and an
 * underlined 16px link with a trailing arrow. No price, no button, no card —
 * the photograph is the whole proposition and the link is a quiet way in.
 *
 * It is the piece that lets a homepage breathe between product grids, and the
 * reason theirs reads as a magazine rather than a catalogue.
 */
export function EditorialPair({
  title,
  eyebrow,
  subtitle,
  items,
}: {
  title?: string;
  eyebrow?: string;
  subtitle?: string;
  items: Array<{ image: string; caption: string; linkLabel?: string; href?: string }>;
}) {
  return (
    <RevealSection className="container-page py-20 sm:py-28 lg:py-40">
      {(title || eyebrow || subtitle) && (
        <div className="mb-10 text-center sm:mb-14">
          {eyebrow && <p className="label-eyebrow mb-3">{eyebrow}</p>}
          {title && <h2 className="text-h2">{title}</h2>}
          {subtitle && (
            <p className="text-lead mx-auto mt-3 max-w-prose text-muted-foreground">{subtitle}</p>
          )}
        </div>
      )}

      {/* Two across from sm. The 8px column gap is theirs — the images almost
          touch, which keeps the pair reading as one composition rather than two
          unrelated pictures. */}
      <div className="grid gap-x-2 gap-y-12 sm:grid-cols-2">
        {items.map((item, i) => (
          <article key={i} className="group">
            {/* 5:7 on a phone, 4:5 from sm — both measured off the reference. */}
            <div className="relative aspect-[5/7] overflow-hidden bg-muted sm:aspect-[4/5]">
              <Image
                src={item.image}
                alt=""
                fill
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02]"
                sizes="(max-width: 640px) 100vw, 50vw"
              />
            </div>

            {item.caption && <h3 className="text-h3 mt-5 font-medium">{item.caption}</h3>}

            {/* Underlined text with a trailing arrow, not a button. Their whole
                page uses this shape, and it is what stops an editorial block
                turning into another call to action competing with the grid. */}
            {item.linkLabel && item.href && (
              <Link
                href={item.href}
                className="mt-2 inline-flex items-center gap-2 border-b border-foreground pb-1 text-sm font-medium transition-colors hover:border-brass hover:text-brass-text"
              >
                {item.linkLabel}
                <ArrowRight
                  className="size-4 transition-transform duration-300 group-hover:translate-x-1"
                  aria-hidden
                />
              </Link>
            )}
          </article>
        ))}
      </div>
    </RevealSection>
  );
}
