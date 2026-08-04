import Link from "next/link";
import Image from "next/image";
import { Star } from "lucide-react";
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
  const testimonials =
    (data.testimonials as Array<{ name?: string; quote?: string; rating?: number }>) ?? [];

  // Hero slides win when any are published; otherwise fall back to the single
  // hero on the homepage singleton, so an empty slide list is never a blank page.
  if (heroSlides.length > 0) {
    return (
      <>
        <HeroCarousel slides={heroSlides} />
        <HomepageSections trustItems={trustItems} testimonials={testimonials} />
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

      <HomepageSections trustItems={trustItems} testimonials={testimonials} />
    </>
  );
}

/** Trust bar + testimonials — shared by the carousel and single-hero layouts. */
function HomepageSections({
  trustItems,
  testimonials,
}: {
  trustItems: Array<{ icon?: string; text?: string }>;
  testimonials: Array<{ name?: string; quote?: string; rating?: number }>;
}) {
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

      {testimonials.length > 0 && (
        <section className="container-page py-16">
          <h2 className="mb-8 text-center text-h2">What our customers say</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((t, i) => (
              <figure key={i} className="rounded-md border bg-card p-6">
                {typeof t.rating === "number" && t.rating > 0 && (
                  <div className="mb-2 flex gap-0.5" aria-label={`${t.rating} out of 5 stars`}>
                    {Array.from({ length: Math.min(5, Math.round(t.rating)) }).map((_, s) => (
                      <Star key={s} className="h-4 w-4 fill-brass text-brass" />
                    ))}
                  </div>
                )}
                <blockquote className="text-sm text-muted-foreground">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                {t.name && (
                  <figcaption className="mt-3 text-sm font-medium">{t.name}</figcaption>
                )}
              </figure>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
