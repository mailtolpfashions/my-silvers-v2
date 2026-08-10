import { EditorialTile } from "@/components/storefront/editorial-tile";
import { RevealSection } from "@/components/storefront/reveal-section";
import { SectionHeading } from "@/components/storefront/section-heading";

/**
 * Two large photographs side by side, each with a caption and an arrow link.
 *
 * The block that lets a homepage breathe between product grids, and the reason
 * the page reads as a magazine rather than a catalogue. No price, no button, no
 * card — the photograph is the whole proposition and the link is a quiet way in.
 *
 * The tile itself now comes from the shared <EditorialTile>, so a collection, a
 * journal post and one half of this pair are the same object. Two is the shape,
 * but three renders as a row of three and one as a single wide block, so an
 * editor is not boxed in.
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
    <RevealSection className="container-page rhythm-editorial">
      <SectionHeading title={title} eyebrow={eyebrow} subtitle={subtitle} align="center" />

      {/* The images almost touch, which keeps the pair reading as one
          composition rather than two unrelated pictures. */}
      <div className="grid gap-x-2 gap-y-12 sm:grid-cols-2">
        {items.map((item, i) => (
          <EditorialTile
            key={i}
            // An item with no link is still a picture worth showing; point it
            // at the catalogue rather than dropping it.
            href={item.href || "/products"}
            image={item.image}
            title={item.caption}
            linkLabel={item.linkLabel}
            sizes="(max-width: 640px) 100vw, 50vw"
          />
        ))}
      </div>
    </RevealSection>
  );
}
