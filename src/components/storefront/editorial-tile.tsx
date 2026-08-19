import Image from "next/image";
import Link from "next/link";
import { EditorialLink } from "@/components/storefront/editorial-link";

/**
 * The one non-product tile on the storefront.
 *
 * A photograph in a portrait frame, and the words BELOW it on the page. That
 * split is the whole design: text burned onto a photograph behind a gradient
 * scrim is what every Shopify theme does, and it was the single loudest
 * template signal left on this site — it appeared on the collection card, the
 * collection index and the journal cards, all three sitting beside a product
 * card that had just shed its border, radius, shadow and scrim.
 *
 * So there is now one shape, used by collections, the journal and the homepage
 * editorial pairs. No radius, no shadow, no scrim, no hover lift. The only
 * motion is a very slow scale on the image, which reads as the photograph
 * breathing rather than the card reacting.
 *
 * Whole-tile linking is done with a stretched overlay anchor rather than by
 * wrapping everything in a <Link>, so the arrow link below stays a real,
 * separately-focusable link for keyboard users and screen readers instead of
 * being swallowed by an outer anchor.
 */
export function EditorialTile({
  href,
  image,
  title,
  eyebrow,
  description,
  linkLabel,
  ratio = "portrait",
  fillHeight = false,
  eager = false,
  sizes = "(max-width: 640px) 100vw, 50vw",
  headingLevel: Heading = "h3",
}: {
  href: string;
  image?: string | null;
  title: string;
  eyebrow?: string | null;
  description?: string | null;
  /** Blank hides the arrow link; the whole tile still navigates. */
  linkLabel?: string | null;
  /** `portrait` 4:5 for collections and pairs, `landscape` 3:2 for journal. */
  ratio?: "portrait" | "landscape";
  /**
   * From lg, drop the fixed crop and let the frame take whatever height is
   * left in the row.
   *
   * For sections inside a .fit-viewport, where the section owns exactly one
   * screen and the tiles absorb the remainder after the heading. The resulting
   * crop is an outcome of the window height — around 16:9 at 1920 — rather than
   * a ratio anyone maintains. Below lg the fixed crop still applies, because
   * there the section is free to be as tall as it likes.
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
  sizes?: string;
  headingLevel?: "h2" | "h3";
}) {
  return (
    <article className={`group relative flex flex-col ${fillHeight ? "lg:h-full" : ""}`}>
      <div
        className={`relative overflow-hidden bg-muted ${
          // 5:7 on a phone, 4:5 from sm — a slightly taller crop at small
          // widths, where a single tile owns the whole screen.
          ratio === "portrait" ? "aspect-[4/5]" : "aspect-[16/9]"
        } ${
          // `min-h-0` is what lets the frame shrink below the image's intrinsic
          // height; without it flex refuses and the section overflows again.
          fillHeight ? "lg:aspect-auto lg:min-h-0 lg:flex-1" : ""
        }`}
      >
        {image ? (
          <Image
            src={image}
            alt=""
            fill
            loading={eager ? "eager" : "lazy"}
            fetchPriority={eager ? "high" : undefined}
            sizes={sizes}
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02]"
          />
        ) : (
          // No artwork — a flat field rather than a broken frame. The title
          // below still names the tile, so nothing is lost but the picture.
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {title}
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-col items-start gap-1.5">
        {eyebrow && <p className="label-eyebrow">{eyebrow}</p>}
        <Heading className="text-h3 font-medium">
          {/* The stretched link. z-0 so the arrow link below, which sits in the
              normal flow at z-auto, still receives its own clicks. */}
          <Link
            href={href}
            transitionTypes={["nav-forward"]}
            className="before:absolute before:inset-0 before:z-0 before:content-['']"
          >
            {title}
          </Link>
        </Heading>

        {description && (
          <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}

        {linkLabel && (
          <span className="relative mt-2">
            <EditorialLink href={href}>{linkLabel}</EditorialLink>
          </span>
        )}
      </div>
    </article>
  );
}
