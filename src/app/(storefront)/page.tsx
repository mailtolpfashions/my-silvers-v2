import { getPublishedEntry, listPublishedEntries } from "@/server/cms/entries";
import { toHeroSlides } from "@/server/cms/hero-slides";
import { resolveHomepageSections } from "@/server/products/homepage-sections";
import { HomepageView } from "@/components/storefront/cms/homepage-view";
import { HeroCarousel } from "@/components/storefront/hero-carousel";
import { HomepageSection } from "@/components/storefront/homepage-section";

/**
 * The homepage decides nothing about content. Hero, sections, their order,
 * headings, item counts and links all come from the CMS `homepage` entry and
 * `heroSlide` entries. Add a section by extending the content type's field
 * definitions in prisma/seed.ts — never by adding JSX here.
 */
export default async function HomePage() {
  const [homepage, heroEntries] = await Promise.all([
    getPublishedEntry("homepage"),
    listPublishedEntries("heroSlide", 10),
  ]);

  // Depends on the homepage entry, so it can't join the batch above.
  const sections = await resolveHomepageSections(homepage?.data);
  const heroSlides = toHeroSlides(heroEntries);

  return (
    <div>
      {homepage ? (
        <HomepageView data={homepage.data} heroSlides={heroSlides} />
      ) : (
        heroSlides.length > 0 && <HeroCarousel slides={heroSlides} />
      )}

      {sections.map((section) => (
        <HomepageSection key={section.key} section={section} />
      ))}
    </div>
  );
}
