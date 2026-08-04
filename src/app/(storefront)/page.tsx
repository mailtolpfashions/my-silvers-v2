import { Suspense } from "react";
import { getPublishedEntry } from "@/server/cms/entries";
import { toHeroSlides } from "@/server/cms/hero-slides";
import { resolveHomepageSections } from "@/server/products/homepage-sections";
import { HomepageView } from "@/components/storefront/cms/homepage-view";
import { HeroCarousel } from "@/components/storefront/hero-carousel";
import { HomepageSection } from "@/components/storefront/homepage-section";
import { InstagramFeed } from "@/components/storefront/instagram-feed";
import { ProductGridSkeleton } from "@/components/storefront/product-card-skeleton";

/**
 * The homepage decides nothing about content. Hero, sections, their order,
 * headings, item counts and links all come from the CMS `homepage` entry and
 * `heroSlide` entries. Add a section by extending the content type's field
 * definitions in prisma/seed.ts — never by adding JSX here.
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

  return (
    <div>
      {homepage ? (
        <HomepageView data={homepage.data} heroSlides={heroSlides} />
      ) : (
        heroSlides.length > 0 && <HeroCarousel slides={heroSlides} />
      )}

      <Suspense fallback={<HomepageSectionsSkeleton />}>
        <HomepageSections data={homepage?.data} />
      </Suspense>
    </div>
  );
}

async function HomepageSections({ data }: { data?: Parameters<typeof resolveHomepageSections>[0] }) {
  const sections = await resolveHomepageSections(data);

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
      {sections.map((section) => (
        <HomepageSection
          key={section.key}
          section={section}
          morphOwner={morphOwner}
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

function HomepageSectionsSkeleton() {
  return (
    <section className="container-page py-14">
      <ProductGridSkeleton count={8} />
    </section>
  );
}
