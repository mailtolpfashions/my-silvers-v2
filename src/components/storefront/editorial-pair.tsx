import { EditorialTile } from "@/components/storefront/editorial-tile";
import { MobileSwipeRail } from "@/components/storefront/mobile-swipe-rail";
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
    // `fit-viewport` makes this block own exactly one screen from lg up: the
    // heading takes what it needs and the row below absorbs the rest, so the
    // whole section is readable without scrolling. See globals.css for the
    // arithmetic. It is why the tiles are landscape here rather than the 4:5
    // portrait they were — two half-width tiles cannot be portrait AND fit.
    <RevealSection className="container-page rhythm-editorial fit-viewport">
      <SectionHeading title={title} eyebrow={eyebrow} subtitle={subtitle} />

      {/* The site's one grid gutter — see .grid-gutter in globals.css.
          These two photographs used to sit 8px apart, so the pair read as a
          single composition rather than two unrelated pictures. That was a real
          effect and it was given up knowingly: it was also the reason a single
          homepage showed four different column gaps. Uniformity across every
          tiled section was worth more than this one block's tightness. */}
      {/* A swipeable rail on a phone, the same grid from sm up.
          Stacked, this block is two full-height photographs to scroll past
          before the next heading — and because each tile carries its caption
          and link BELOW the picture, the second one is entirely out of sight
          while reading the first. Side by side on a thumb, the pair reads as a
          pair again, which is the whole point of the composition. */}
      <MobileSwipeRail className="grid grid-gutter fit-grow sm:grid-cols-2">
        {items.map((item, i) => (
          <EditorialTile
            key={i}
            // An item with no link is still a picture worth showing; point it
            // at the catalogue rather than dropping it.
            href={item.href || "/products"}
            image={item.image}
            title={item.caption}
            linkLabel={item.linkLabel}
            fillHeight
            // The rail shows a tile at ~82vw rather than the full width the
            // stacked layout took, so the browser must be told — left at
            // 100vw it downloads a phone-width image for a smaller box.
            sizes="(max-width: 640px) 82vw, 50vw"
          />
        ))}
      </MobileSwipeRail>
    </RevealSection>
  );
}
