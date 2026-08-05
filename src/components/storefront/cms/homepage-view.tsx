import Link from "next/link";
import Image from "next/image";
import { CmsIcon } from "@/components/storefront/cms/cms-icon";
import { Button } from "@/components/ui/button";
import { HeroCarousel, type HeroSlide } from "@/components/storefront/hero-carousel";
import type { EntryData } from "@/server/cms/types";

/**
 * Pure presentational renderer for the CMS "homepage" singleton. Shared
 * between the real homepage (published data) and the live-preview pane
 * (draft data) — one renderer, no drift between preview and production.
 */
export function HomepageView({
  data,
  heroSlides = [],
}: {
  data: EntryData;
  /** Published `heroSlide` entries. When present they replace the single hero. */
  heroSlides?: HeroSlide[];
}) {
  // No copy defaults here — every string is the CMS entry's to own. Each is
  // rendered only when set, so clearing a field removes it rather than
  // silently falling back to wording nobody can edit.
  const heroTitle = data.heroTitle as string | undefined;
  const heroSubtitle = data.heroSubtitle as string | undefined;
  const heroCta = data.heroCta as string | undefined;
  const heroLink = (data.heroLink as string) || "/products";
  const heroImage = data.heroImage as string | undefined;
  const heroBackground = data.heroBackground as string | undefined;
  const trustItems = (data.trustItems as Array<{ icon?: string; text?: string }>) ?? [];

  // Hero slides win when any are published; otherwise fall back to the single
  // hero on the homepage singleton, so an empty slide list is never a blank page.
  if (heroSlides.length > 0) {
    return (
      <>
        <HeroCarousel slides={heroSlides} />
        <TrustBar trustItems={trustItems} />
      </>
    );
  }

  return (
    <>
      <section
        className="relative overflow-hidden"
        style={heroBackground ? { backgroundColor: heroBackground } : undefined}
      >
        <div className="container-page grid items-center gap-8 py-16 sm:py-24 lg:grid-cols-2">
          <div className={heroImage ? "text-left" : "text-center lg:col-span-2"}>
            <p className="label-eyebrow">925 Sterling Silver</p>
            {heroTitle && (
              // The type scale, not an ad-hoc text-4xl/5xl pair — this heading
              // and the section headings below it were previously sized by
              // different rules and didn't sit in the same hierarchy.
              <h1 className="mt-4 text-display">{heroTitle}</h1>
            )}
            {heroSubtitle && (
              <p className={`mt-4 max-w-xl text-muted-foreground ${heroImage ? "" : "mx-auto"}`}>
                {heroSubtitle}
              </p>
            )}
            {heroCta && (
              <Button asChild size="lg" className="mt-8">
                <Link href={heroLink}>{heroCta}</Link>
              </Button>
            )}
          </div>
          {heroImage && (
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl">
              <Image
                src={heroImage}
                // Decorative when there's no headline to describe it.
                alt={heroTitle ?? ""}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
                preload
              />
            </div>
          )}
        </div>
      </section>

      <TrustBar trustItems={trustItems} />
    </>
  );
}

/**
 * The trust bar, directly under the hero — shared by both hero layouts.
 *
 * Testimonials used to render here too, which put social proof immediately
 * below the hero and above every product. They now render at the bottom of the
 * page — now replaced entirely by real product reviews (CustomerReviews).
 */
function TrustBar({ trustItems }: { trustItems: Array<{ icon?: string; text?: string }> }) {
  return (
    <>
      {trustItems.length > 0 && (
        <section className="border-y bg-muted/30">
          <div className="container-page flex flex-wrap justify-center gap-x-10 gap-y-3 py-5">
            {trustItems.map((item, i) => (
              <span key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                <CmsIcon name={item.icon} className="size-4 shrink-0 text-brass-text" />
                {item.text}
              </span>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

