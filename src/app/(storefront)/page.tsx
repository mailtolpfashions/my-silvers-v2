import { Suspense } from "react";
import { getPublishedEntry } from "@/server/cms/entries";
import { toHeroSlides } from "@/server/cms/hero-slides";
import { resolveHomepageSections } from "@/server/products/homepage-sections";
import { HomepageView } from "@/components/storefront/cms/homepage-view";
import { CustomerReviews } from "@/components/storefront/customer-reviews";
import { HeroCarousel } from "@/components/storefront/hero-carousel";
import { HomepageSection } from "@/components/storefront/homepage-section";
import { HeroRevealSnap } from "@/components/storefront/motion/hero-reveal-snap";
import { InstagramFeed } from "@/components/storefront/instagram-feed";
import { ProductGridSkeleton } from "@/components/storefront/product-card-skeleton";

/**
 * The homepage decides nothing about content. Hero, sections, their order,
 * headings, item counts and links all come from the CMS `homepage` entry — a
 * single singleton, including the hero slides. (There was once a separate
 * `heroSlide` content type; it was merged in so editors have one place to look.)
 * Add a section by extending the content type's field definitions in
 * prisma/seed.ts — never by adding JSX here.
 *
 * The hero is rendered directly, NOT behind a Suspense boundary: it is the LCP
 * element, and putting it in a fallback would delay the one thing the page is
 * judged on. Everything below it streams.
 */
export default async function HomePage() {
  // One read: slides live on the homepage entry now, so the separate
  // heroSlide query is gone.
  const homepage = await getPublishedEntry("homepage");
  const heroSlides = toHeroSlides(homepage?.data);

  /**
   * Whether the page opens with the full-bleed 100svh carousel, as opposed to
   * HomepageView's in-flow fallback hero. Both branches below agree: slides are
   * the only thing that produces a <HeroCarousel>.
   *
   * This is the precondition for the pinned reveal. The band is pulled up by a
   * whole viewport to sit behind the hero, so under a short in-flow hero it
   * would ride up over the header instead.
   */
  const heroIsFullBleed = heroSlides.length > 0;

  return (
    <div>
      {homepage ? (
        <HomepageView data={homepage.data} heroSlides={heroSlides} />
      ) : (
        heroSlides.length > 0 && <HeroCarousel slides={heroSlides} />
      )}

      {/*
        Everything below the hero, in one element.

        ── Why the wrapper exists ────────────────────────────────────────────
        It is the opaque sheet that covers the sticky hero below 1024px — see
        the .hero-curtain block in globals.css. That backdrop CANNOT live on
        the sections themselves, which was the first attempt: every section is
        a .reveal-section that starts at `opacity: 0`, and opacity applies to
        an element's own background as well as its contents. So each section's
        backdrop was transparent for exactly as long as the section was fading
        in — outscroll the IntersectionObserver and the hero showed straight
        through the page. This wrapper never animates, so it is never
        transparent.

        Inert above lg and under reduced motion, where it is a plain div with
        no position and no fill: the negative top margin on the first pinned
        stage collapses through it and the desktop chain's geometry is
        unchanged. Verified — the stage still resolves to margin-top: -900px
        at 1440.
      */}
      <div className="page-over-hero">
        <Suspense fallback={<HomepageSectionsSkeleton />}>
          <HomepageSections data={homepage?.data} revealEnabled={heroIsFullBleed} />
        </Suspense>

        {/* Last thing before the footer — social proof lands after a shopper has
            seen the products it's vouching for. Behind its own boundary so a
            review query never delays the catalogue above it. */}
        <Suspense fallback={null}>
          <CustomerReviews />
        </Suspense>
      </div>
    </div>
  );
}

async function HomepageSections({
  data,
  revealEnabled = false,
}: {
  data?: Parameters<typeof resolveHomepageSections>[0];
  /** Set when the page opens with a full-bleed hero — see the note above. */
  revealEnabled?: boolean;
}) {
  const sections = await resolveHomepageSections(data);

  /**
   * The shutter chain: the LEADING run of sections that have opted into the
   * pinned reveal, each one uncovered as the thing above it scrolls away.
   *
   * Leading, and that is a hard constraint rather than a simplification. Every
   * stage is pulled up by exactly 100svh to sit behind its predecessor, which
   * only lands correctly if that predecessor is itself exactly one viewport
   * tall. The hero is (h-svh) and so is every stage in the chain — an ordinary
   * in-flow section is not, so the moment the run is broken the arithmetic
   * stops holding. Hence: start at index 0, stop at the first section that has
   * not opted in.
   *
   * Indexed off the RESOLVED list, since sections that resolve to nothing are
   * dropped upstream and spec[0] is routinely not sections[0].
   *
   * The depth each section gets is its position in the chain, which becomes its
   * z-index: earlier stages paint over later ones, which is what makes each one
   * a curtain for the next.
   */
  const revealDepths = new Map<string, number>();
  if (revealEnabled) {
    for (const [i, section] of sections.entries()) {
      if (!("pinnedReveal" in section) || !section.pinnedReveal) break;
      revealDepths.set(section.key, i);
    }
  }

  /**
   * Which section owns the morph for each product.
   *
   * A product can legitimately appear in two sections — "New in" and
   * "Bestsellers" routinely overlap — and two elements sharing a
   * view-transition-name make the browser abandon the transition for the whole
   * document. So the first section to show a product claims the name and the
   * rest render plain images.
   */
  const morphOwner = new Map<string, string>();
  for (const section of sections) {
    if (section.kind !== "products") continue;
    for (const item of section.items) {
      if (!morphOwner.has(item.id)) morphOwner.set(item.id, section.key);
    }
  }

  return (
    <>
      {/* Renders nothing, and nothing at all below 1024px or under reduced
          motion. One instance for the whole chain rather than one per stage —
          the snap points are offsets on a single scroll, so they belong to the
          page, not to any section. Mounted only when there IS a chain. */}
      {revealDepths.size > 0 && <HeroRevealSnap stages={revealDepths.size} />}

      {sections.map((section) => (
        <HomepageSection
          key={section.key}
          section={section}
          morphOwner={morphOwner}
          /**
           * undefined for everything outside the chain, which is the ordinary
           * page. An editor who reorders the homepage so a product grid leads,
           * or who clears the "Pinned reveal" switch, gets that back with no
           * code change.
           */
          revealDepth={revealDepths.get(section.key)}
          // Passed in rather than imported by the section renderer — see the
          // note on instagramSlot.
          instagramSlot={
            section.kind === "instagram" ? (
              <InstagramFeed title={section.title} eyebrow={section.eyebrow} />
            ) : undefined
          }
        />
      ))}
    </>
  );
}

/**
 * `min-h-svh` so the document is never shorter than it will be once the
 * sections arrive. When the first section is the pinned band it contributes a
 * net 100svh below the hero (200svh of wrapper less its 100svh of negative
 * margin); without a floor here the page would be hero-height during streaming
 * and grow by a viewport on resolve, which moves the scrollbar under anyone who
 * started scrolling immediately.
 */
function HomepageSectionsSkeleton() {
  return (
    <section className="container-page min-h-svh rhythm-commerce">
      <ProductGridSkeleton count={8} />
    </section>
  );
}
