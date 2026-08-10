import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { CmsIcon } from "@/components/storefront/cms/cms-icon";
import { ProductCard, productMorphName, PRODUCT_GRID_CLASS } from "@/components/storefront/product-card";
import { CollectionCard } from "@/components/storefront/collection-card";
import { RevealSection } from "@/components/storefront/reveal-section";
import { StorySection } from "@/components/storefront/story-section";
import { EditorialPair } from "@/components/storefront/editorial-pair";
import { EditorialLink } from "@/components/storefront/editorial-link";
import { SectionHeading } from "@/components/storefront/section-heading";
import type { HomepageSection as Section } from "@/server/products/homepage-sections";

/**
 * Renders one CMS-configured homepage section. All copy, counts and link
 * targets come from the section data — nothing is decided here.
 */
export function HomepageSection({
  section,
  morphOwner,
  instagramSlot,
}: {
  section: Section;
  /**
   * productId → the section key allowed to own that product's morph name.
   * Built once per page so a product shown twice cannot register a duplicate
   * view-transition-name. See the note in (storefront)/page.tsx.
   */
  morphOwner?: Map<string, string>;
  /**
   * The Instagram feed, supplied by the caller rather than imported here.
   *
   * InstagramFeed is an async server component that calls the Graph API, so a
   * static import would drag server-only code into any client tree that renders
   * a section — which is exactly what the CMS preview needs to do. The
   * storefront passes the real feed; the preview passes a placeholder.
   */
  instagramSlot?: React.ReactNode;
}) {
  if (section.kind === "instagram") {
    return instagramSlot ?? null;
  }

  if (section.kind === "editorialPair") {
    return (
      <EditorialPair
        title={section.title}
        eyebrow={section.eyebrow}
        subtitle={section.subtitle}
        items={section.items}
      />
    );
  }

  if (section.kind === "story") {
    return (
      <StorySection
        title={section.title}
        eyebrow={section.eyebrow}
        stages={section.stages}
        image={section.image!}
        ctaLabel={section.ctaLabel}
        ctaHref={section.ctaHref}
      />
    );
  }

  if (section.kind === "editorial") {
    const imageFirst = section.imageSide === "left";
    return (
      <RevealSection className="container-page rhythm-editorial">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          {section.image && (
            <div
              // order controls which side the image lands on without changing
              // the DOM order, so the heading still precedes its copy for
              // screen readers and keyboard users.
              className={`relative aspect-[4/3] overflow-hidden bg-muted ${
                imageFirst ? "lg:order-1" : "lg:order-2"
              }`}
            >
              <Image
                src={section.image}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </div>
          )}
          <div className={imageFirst ? "lg:order-2" : "lg:order-1"}>
            {section.eyebrow && <p className="label-eyebrow mb-3">{section.eyebrow}</p>}
            <h2 className="text-h2 rule-brass">{section.title}</h2>
            {section.subtitle && (
              <p className="text-lead mt-4 max-w-prose text-muted-foreground">{section.subtitle}</p>
            )}
            {section.body && (
              <p className="mt-6 max-w-prose leading-relaxed text-muted-foreground">
                {section.body}
              </p>
            )}
            {/* Editorial link, not a rounded button — this block invites, it
                does not transact. */}
            {section.ctaLabel && section.ctaHref && (
              <div className="mt-8">
                <EditorialLink href={section.ctaHref}>{section.ctaLabel}</EditorialLink>
              </div>
            )}
          </div>
        </div>
      </RevealSection>
    );
  }

  if (section.kind === "categoryTiles") {
    /**
     * Three category tiles in one gapless band that resizes under the pointer.
     *
     * Rebuilt against the reference's category teaser: the category name laid
     * over the picture, a scrim that fades up on hover, a slight vertical drift
     * on the image as the band crosses the viewport, and — the part that makes
     * the band feel like a place rather than three links — the hovered tile
     * expanding to about twice its width while its neighbours compress. The
     * ratio and the .6s timing are measured, not invented; see .tile-accordion
     * in globals.css, which owns the whole interaction in CSS.
     *
     * The band is 2:1 from sm, so at 1440 each resting tile is 480×720 — the
     * portrait proportion the reference uses, and the shape that lets a name
     * and a CTA sit in a tile that is only a third of the screen. Below sm the
     * tiles stack and stay square: three columns at 375 would be 120px
     * thumbnails, where the name would not fit and the photograph would stop
     * being one. Category.image is 900×900 today and still covers both crops.
     *
     * Deliberately outside container-page so it reaches the viewport edges, and
     * deliberately without a heading — the tiles name themselves.
     */
    return (
      <RevealSection className="tile-accordion flex flex-col sm:aspect-[2/1] sm:flex-row">
        {section.items.slice(0, 3).map((item, i) => (
          <Link
            key={item.id}
            href={`/category/${item.slug}`}
            // Square while stacked; from sm the band owns the height and each
            // tile fills it, so only the width is left for the accordion to
            // animate. `overflow-hidden` is what keeps the photograph steady
            // while its frame narrows.
            className="group relative flex aspect-square items-center justify-center overflow-hidden bg-muted sm:aspect-auto sm:h-full"
          >
            {item.image && (
              // Taller than the tile and pulled up by half the overflow, so the
              // ±5% drift never exposes an edge. The wrapper is the positioned
              // ancestor that `fill` resolves against.
              <div
                aria-hidden
                className="tile-drift absolute inset-x-0 top-[-5%] h-[110%]"
              >
                <Image
                  src={item.image}
                  alt=""
                  fill
                  loading={i === 0 ? undefined : "lazy"}
                  className="object-cover"
                  // 50vw, not 33vw: a hovered tile grows to half the band, and
                  // sizing for the resting third would resample it upward for
                  // the whole time it is expanded — which is exactly when it is
                  // being looked at.
                  sizes="(max-width: 640px) 100vw, 50vw"
                />
              </div>
            )}

            {/* An EVEN wash, not a foot gradient. The name is centred, so it
                sits where a bottom-up scrim is at its weakest — white type on
                the middle of a pale photograph would be unreadable. A flat 30%
                guarantees contrast against any uploaded image, and deepens on
                hover, which is the reference's own `opacity: 0` overlay. */}
            <div
              aria-hidden
              className="absolute inset-0 bg-graphite-950/30 transition-colors duration-500 group-hover:bg-graphite-950/45"
            />

            <div className="relative flex flex-col items-center gap-4 px-6 text-center">
              {/* 28px, not 20px. On a 475px tile the smaller size read as a
                  caption rather than a doorway — this is one of three things
                  the band exists to say. */}
              <span className="text-h2 font-medium text-white">{item.name}</span>
              {/* A span, not a link: the whole tile is already an anchor, and a
                  nested <a> is invalid and breaks keyboard navigation. Styled
                  to match <EditorialLink light> so the site keeps one visual
                  CTA language even where the markup has to differ. At rest the
                  tile is a photograph and a name; the rule fades up on hover.
                  Always visible below sm, where there is no hover to reveal it. */}
              <span className="inline-flex items-center gap-2 border-b border-white/70 pb-1 text-sm font-medium text-white transition-opacity duration-300 sm:opacity-0 sm:group-hover:opacity-100">
                Discover
                <ArrowRight
                  aria-hidden
                  className="size-4 transition-transform duration-300 group-hover:translate-x-1"
                />
              </span>
            </div>
          </Link>
        ))}
      </RevealSection>
    );
  }

  if (section.kind === "usp") {
    return (
      // No tinted band and no enclosing border. A filled strip with four
      // icon cards in it is the "trust badges" pattern every template ships,
      // and it announced these claims as marketing. They carry further set
      // quietly on the page, separated by hairlines, with the icon small and
      // the type at body size.
      <RevealSection className="border-t">
        <div className="container-page rhythm-editorial">
          <SectionHeading
            title={section.title}
            eyebrow={section.eyebrow}
            subtitle={section.subtitle}
            align="center"
          />
          <ul className="grid gap-x-10 sm:grid-cols-2 lg:grid-cols-4">
            {section.items.map((item, i) => (
              <li
                key={i}
                className="flex flex-col items-start gap-2 border-t py-6 lg:border-t-0 lg:py-0"
              >
                {/* Same resolver as the trust bar: a Lucide name or an emoji. */}
                <CmsIcon name={item.icon} className="size-5 text-brass-text" />
                {item.title && <p className="text-sm font-medium text-foreground">{item.title}</p>}
                {item.text && (
                  <p className="text-sm leading-relaxed text-muted-foreground">{item.text}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      </RevealSection>
    );
  }

  if (section.kind === "banner") {
    const banner = (
      <div className="relative aspect-[16/5] w-full overflow-hidden bg-muted">
        <Image
          src={section.image}
          alt={section.title}
          fill
          className="object-cover"
          sizes="(max-width: 1600px) 100vw, 1600px"
        />
        {section.title && (
          <>
            <div className="absolute inset-0 bg-gradient-to-r from-black/55 to-transparent" />
            <div className="absolute inset-y-0 left-0 flex max-w-md flex-col justify-center p-6 sm:p-10">
              {section.eyebrow && (
                <p className="label-eyebrow label-eyebrow-light mb-2">
                  {section.eyebrow}
                </p>
              )}
              <p className="text-h2 font-heading text-white">{section.title}</p>
            </div>
          </>
        )}
      </div>
    );

    return (
      <RevealSection className="container-page py-4 sm:py-8">
        {section.link ? (
          <Link href={section.link} className="block">
            {banner}
          </Link>
        ) : (
          banner
        )}
      </RevealSection>
    );
  }

  // One reveal mechanism for the whole section, and it is the CSS one. The
  // GSAP stagger that used to animate each card individually is gone — see
  // story-section.tsx for what the measurement showed.
  //
  // Commerce grids are LEFT-aligned and carry their "view all" beside the
  // heading; the editorial blocks above are centred. Centring everything was
  // flattening the page — see the note in section-heading.tsx.
  const viewAll = section.viewAllHref ? (
    <EditorialLink href={section.viewAllHref}>View all</EditorialLink>
  ) : undefined;

  return (
    <RevealSection className="container-page rhythm-editorial">
      <SectionHeading
        title={section.title}
        eyebrow={section.eyebrow}
        subtitle={section.subtitle}
        align="left"
        action={viewAll}
      />

      {section.kind === "products" ? (
        <div className={PRODUCT_GRID_CLASS}>
          {section.items.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              morphName={
                morphOwner?.get(product.id) === section.key
                  ? productMorphName(product.id)
                  : undefined
              }
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {section.items.map((collection) => (
            <CollectionCard key={collection.id} collection={collection} />
          ))}
        </div>
      )}
    </RevealSection>
  );
}
