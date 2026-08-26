import Image from "next/image";
import Link from "next/link";

/**
 * The editorial header shared by every listing page — the catalogue, a category
 * and a collection.
 *
 * Category pages already had a version of this; the catalogue at /products had
 * nothing but an h1 at 40px of padding, despite being the most-linked shopping
 * page on the site and the destination of every search. Collections had a third
 * arrangement again. One component now, so the three cannot drift.
 *
 * Two modes, chosen by whether there is artwork:
 *
 *   with an image   full-bleed band, copy laid over a left-weighted scrim
 *   without one     copy on the page, left aligned, hairline closed
 *
 * The scrim is sized against an arbitrary uploaded photograph, which is the
 * case it actually has to survive.
 */
export function PageHeader({
  title,
  eyebrow,
  description,
  image,
  imageHref,
  imageAlt = "",
}: {
  title: string;
  eyebrow?: string | null;
  description?: string | null;
  image?: string | null;
  /** Makes the artwork clickable. Never the heading — an h1 that navigates
   *  somewhere else is a trap. */
  imageHref?: string | null;
  imageAlt?: string;
}) {
  if (!image) {
    return (
      <div className="container-page rhythm-commerce-top">
        <div className="max-w-prose">
          {eyebrow && <p className="label-eyebrow mb-3">{eyebrow}</p>}
          <h1 className="text-h1">{title}</h1>
          {description && (
            <p className="text-lead mt-4 text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
    );
  }

  const art = (
    <Image
      src={image}
      alt={imageAlt}
      fill
      // Above the fold on every listing page, so it carries the LCP.
      // eager rather than preload — preload only emits a <link> in <head>,
      // which a streamed page has usually already flushed. See product-card.tsx.
      loading="eager"
      fetchPriority="high"
      className="object-cover object-center"
      sizes="100vw"
    />
  );

  return (
    /**
     * Half the height it was: 32:5 where it used to be 16:5, and a 240px floor
     * where it used to be 340px. On a 1920 screen that is 300px rather than
     * 600 — the band was taking a third of the viewport before a shopper saw a
     * single product, on pages whose entire job is showing products.
     *
     * ⚠️  The floor does not halve with the ratio, and cannot. It exists
     * because the copy needs a fixed amount of room — eyebrow, heading and two
     * lines of description come to roughly 160px whatever the viewport is
     * doing — so below about 1536px the band stops shrinking and letterboxes
     * the artwork rather than clipping the words. Take the floor much under
     * 240px and the description starts colliding with the edges.
     */
    <section className="relative aspect-[32/5] min-h-[240px] w-full overflow-hidden bg-black">
      {imageHref ? (
        <Link href={imageHref} aria-label={title} className="absolute inset-0">
          {art}
        </Link>
      ) : (
        art
      )}

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to right, rgba(12,12,14,0.78) 0%, rgba(12,12,14,0.55) 40%, rgba(12,12,14,0.05) 70%)",
        }}
      />

      {/* pointer-events-none on the wrapper so the artwork link stays clickable
          through the copy column; the text itself isn't interactive. */}
      <div className="pointer-events-none absolute inset-0 flex items-center">
        <div className="container-page">
          <div className="max-w-[560px]">
            {eyebrow && <p className="label-eyebrow label-eyebrow-light mb-4">{eyebrow}</p>}
            {/* text-white spelled out: the base layer colours every heading
                directly, and a direct rule beats an inherited one whatever the
                layer order — so the headline would otherwise come out
                near-black on the scrim. */}
            <h1 className="text-h1 font-heading text-white">{title}</h1>
            {description && <p className="text-lead mt-3 text-white/80">{description}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
