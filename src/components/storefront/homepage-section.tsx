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
 * The hero's own z-index, minus one.
 *
 * Stages count DOWN from here, so the first stage sits directly under the hero
 * and each subsequent one under its predecessor — which is what makes every
 * stage a curtain for the next. Nine stages is far more than any homepage
 * should have, and the header at z-40 is clear of all of it.
 */
const REVEAL_Z_TOP = 9;

/**
 * One stage of the shutter chain: held to the viewport and uncovered as
 * whatever sits above it scrolls away.
 *
 * ── The mechanism ────────────────────────────────────────────────────────────
 * The stage is pinned to the top of the viewport from its first frame, sitting
 * BEHIND the thing above it. That thing — the hero, or the previous stage — is
 * an ordinary element that scrolls up and off normally, and what that uncovers
 * is this stage's LOWER portion first. Nothing here moves; the thing above
 * moving is the entire effect.
 *
 * The three numbers are one decision, and they are uniform across every stage,
 * which is what lets hero-reveal-snap.tsx place its snap points at plain
 * multiples of the hero's height without measuring anything:
 *   -mt-[100svh]  pulls the stage up so its pinned position is the foot of the
 *                 element above rather than the foot of the document so far
 *   h-[200svh]    governs how long it stays stuck: it releases at
 *                 (wrapper − 100svh), the exact frame the thing above has
 *                 finished clearing. No hold, so no stretch of dead scroll
 *   h-svh         the stage itself, exactly one viewport — the unit the whole
 *                 chain's arithmetic is expressed in
 *
 * ⚠️  Do not add a hold. This wrapper was briefly 250svh, on the reasoning that
 * a stage needed somewhere to REST or a hard flick would sail past it. The
 * diagnosis was right and the fix was wrong: 50svh of pinned, fully-revealed
 * section is 50svh in which scrolling does nothing, and it read as the page
 * having stalled. Resting is a SCROLL problem, not a LAYOUT one, and
 * hero-reveal-snap.tsx solves it with a snap point at exactly this release
 * offset. Lengthening this again would put the dead scroll back AND duplicate
 * what the snap already does.
 *
 * ── Gated at lg, not sm ──────────────────────────────────────────────────────
 * Deliberately the same 1024px gate the Lenis provider uses. It was briefly sm,
 * which left 640–1023px with a pinned reveal and no snap to land it — exactly
 * the "cannot land on the section" complaint the snap exists to answer, still
 * live on tablets. Below the gate every stage renders as an ordinary in-flow
 * section, which is the layout they were designed as. Keep these two gates
 * equal: a pinned stage without a snap is worse than no pinned stage.
 *
 * ── Not wrapped in RevealSection ─────────────────────────────────────────────
 * That component fades its subtree in from a translateY, and a transformed
 * ancestor becomes the containing block for `position: sticky` — the pin would
 * be scoped to the wrapper and never reach the viewport. The fade would also be
 * redundant: the curtain lifting is already the entrance.
 */
function PinnedRevealStage({
  depth,
  innerClassName = "",
  children,
}: {
  depth: number;
  /** Layout classes for the pinned element itself, which vary per section kind. */
  innerClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="lg:-mt-[100svh] lg:h-[200svh]">
      <div
        className={`lg:sticky lg:top-0 lg:h-svh ${innerClassName}`}
        // Inline because it is derived. Inert below lg, where the element is
        // not positioned and z-index therefore does nothing.
        style={{ zIndex: REVEAL_Z_TOP - depth }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Renders one CMS-configured homepage section. All copy, counts and link
 * targets come from the section data — nothing is decided here.
 */
export function HomepageSection({
  section,
  morphOwner,
  instagramSlot,
  revealDepth,
}: {
  section: Section;
  /**
   * This section's position in the shutter chain, or undefined if it is not in
   * one — which is the ordinary page.
   *
   * The caller owns the decision entirely, because it depends on things a
   * single section cannot see: whether the page opens with a full-bleed hero,
   * and whether every section above this one is also pinned. See the chain
   * computation in (storefront)/page.tsx. The depth becomes the stage's
   * z-index, so earlier stages curtain over later ones.
   */
  revealDepth?: number;
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
    const story = (
      <StorySection
        title={section.title}
        eyebrow={section.eyebrow}
        stages={section.stages}
        image={section.image!}
        ctaLabel={section.ctaLabel}
        ctaHref={section.ctaHref}
        // The stage owns the height; the section must not set its own.
        fill={revealDepth !== undefined}
      />
    );

    return revealDepth !== undefined ? (
      <PinnedRevealStage depth={revealDepth}>{story}</PinnedRevealStage>
    ) : (
      story
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
            <h2 className="text-h2 rule-black">{section.title}</h2>
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
    const tiles = section.items.slice(0, 3).map((item, i) => (
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
              // drift never exposes an edge. These two numbers are dictated by
              // the ±12% in @keyframes tile-drift — see the arithmetic in the
              // comment above that block before changing either. The wrapper is
              // also the positioned ancestor that `fill` resolves against.
              <div
                aria-hidden
                className="tile-drift absolute inset-x-0 top-[-17%] h-[134%]"
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
              className="absolute inset-0 bg-black/30 transition-colors duration-500 group-hover:bg-black/45"
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
    ));

    // The pinned variant lives in PinnedRevealStage — see the note on that
    // component. Only the inner classes differ per section kind; here they are
    // the accordion row itself, so the tiles keep resizing under the pointer
    // exactly as they do in the ordinary in-flow band.
    if (revealDepth !== undefined) {
      return (
        <PinnedRevealStage depth={revealDepth} innerClassName="tile-accordion flex flex-col lg:flex-row">
          {tiles}
        </PinnedRevealStage>
      );
    }

    return (
      <RevealSection className="tile-accordion flex flex-col sm:aspect-[2/1] sm:flex-row">
        {tiles}
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
                <CmsIcon name={item.icon} className="size-5 text-black" />
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
    const pinned = revealDepth !== undefined;
    const banner = (
      // Pinned, the stage owns the height and the banner fills it edge to edge;
      // in flow it keeps its 16:5 letterbox inside container-page. A 16:5 crop
      // dropped into a 100svh stage would letterbox against bg-muted for most
      // of the viewport, which is why this swaps rather than just stretching.
      <div
        className={`relative w-full overflow-hidden bg-muted ${
          pinned ? "h-full" : "aspect-[16/5]"
        }`}
      >
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

    // `block h-full` on the link too, or the anchor collapses to its content's
    // height inside the stage and the banner has nothing to fill.
    const linked = section.link ? (
      <Link href={section.link} className={pinned ? "block h-full" : "block"}>
        {banner}
      </Link>
    ) : (
      banner
    );

    return pinned ? (
      <PinnedRevealStage depth={revealDepth}>{linked}</PinnedRevealStage>
    ) : (
      <RevealSection className="container-page py-4 sm:py-8">{linked}</RevealSection>
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
