import Image from "next/image";
import Link from "next/link";

/**
 * One photographic doorway: a picture, with its name laid over the foot of it
 * and nothing else at all.
 *
 * ── Why the name is ON the photograph here ───────────────────────────────────
 * EditorialTile puts its words BELOW the picture on purpose, and the note in
 * that file is emphatic about why: type burned onto a photograph behind a scrim
 * is the loudest template signal there is, and it was the last one left on this
 * site. This tile is the documented exception, for the same reason the category
 * band is one — it is a DOORWAY, not an editorial card. It carries a single
 * word, that word IS the destination, and setting it underneath in the page's
 * ivory would read as a caption describing a picture rather than as a way in.
 *
 * The exception holds only while the tile stays that austere. One word, over
 * the picture. No description, no arrow link, no price, no second line. The
 * moment any of those is wanted here, this has stopped being a doorway and the
 * block should use EditorialTile instead — which already does all of it, below
 * the frame, where it belongs.
 *
 * ── A foot gradient, where the category band uses an even wash ───────────────
 * Not an inconsistency; the two follow from where each puts its name. That band
 * CENTRES its name, which is exactly where a bottom-up scrim is weakest, so it
 * has to wash the whole tile flat. This one sets its name at the foot, so a
 * gradient is both sufficient and better: it leaves the top two thirds of the
 * photograph entirely unwashed, which on a jewellery shot is where the subject
 * actually is.
 *
 * The hover deepen is a separate flat overlay rather than a darker gradient,
 * because gradient colour stops do not interpolate reliably across a class
 * swap — the fill would jump rather than fade.
 */
export function WorldTile({
  item,
  fillHeight = false,
  className = "",
  eager = false,
}: {
  item: { image: string; label: string; href?: string };
  /**
   * Grid placement from the caller. The band's stagger is produced by giving
   * each tile a different row span, and only the band can know which — a tile
   * cannot see its position. See the worldTiles branch in homepage-section.tsx.
   */
  className?: string;
  /**
   * From lg, drop the fixed crop and take the full height of the row.
   *
   * The band this belongs to is inside a .fit-viewport, so the row is given
   * exactly what is left of the screen after the heading and each tile fills
   * it. At 1920 that lands around 439×578 — still portrait, still a real
   * photograph. Below lg the 16:10 crop applies as before.
   *
   * This replaced a `tall` prop that selected a 7:5 crop instead of 16:10. That
   * existed to stagger a two-column band: the columns started on opposite crops
   * so their inner seams landed at different heights. The band is one row of
   * four now — it has no seam left to offset — and the stagger went with it.
   */
  fillHeight?: boolean;
  /**
   * Load this tile's image immediately. Above-the-fold tiles only.
   *
   * ⚠️ NOT next/image's `preload`, which this used to be. That prop only
   * injects a `<link>` into `<head>` and leaves the img `loading="lazy"` — and
   * on a streamed page the head has usually flushed, so it emitted nothing at
   * all. See the `eager` note in product-card.tsx.
   */
  eager?: boolean;
}) {
  const frame = (
    <>
      <Image
        src={item.image}
        // Decorative: the label beside it already names the destination, and on
        // a linked tile that label is the link's accessible name. Repeating it
        // here would have a screen reader announce the world twice.
        alt=""
        fill
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : undefined}
        // A quarter of the page in the four-up row, half at tablet widths where
        // it drops to two columns, the whole of it once stacked.
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
        className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
      />

      {/* Legibility, and only at the foot — see the note above. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 via-black/30 to-transparent"
      />
      {/* The acknowledgement on hover. Flat, so it fades rather than jumps. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-black/0 transition-colors duration-500 group-hover:bg-black/20"
      />

      {/* A span, not a heading. The tile is one link whose text is its name, so
          a heading here would add an outline entry per doorway and say the same
          word twice. Same call the category band makes. */}
      <span className="absolute inset-x-0 bottom-0 p-6 text-center text-h2 font-medium text-white sm:p-8">
        {item.label}
      </span>
    </>
  );

  const frameClass = `group relative block overflow-hidden bg-muted ${
    fillHeight ? "aspect-[16/10] lg:aspect-auto lg:h-full" : "aspect-[16/10]"
  } ${className}`;

  // An unlinked tile is a legitimate editorial state — a world announced before
  // its landing page exists — so it renders as a plain frame rather than an
  // anchor to nowhere.
  return item.href ? (
    <Link href={item.href} transitionTypes={["nav-forward"]} className={frameClass}>
      {frame}
    </Link>
  ) : (
    <div className={frameClass}>{frame}</div>
  );
}
