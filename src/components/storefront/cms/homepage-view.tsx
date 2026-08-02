import Link from "next/link";
import Image from "next/image";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EntryData } from "@/server/cms/types";

/**
 * Pure presentational renderer for the CMS "homepage" singleton. Shared
 * between the real homepage (published data) and the live-preview pane
 * (draft data) — one renderer, no drift between preview and production.
 */
export function HomepageView({ data }: { data: EntryData }) {
  const heroTitle = (data.heroTitle as string) || "Jewellery, crafted for everyday wear.";
  const heroSubtitle = data.heroSubtitle as string | undefined;
  const heroCta = (data.heroCta as string) || "Shop the collection";
  const heroLink = (data.heroLink as string) || "/products";
  const heroImage = data.heroImage as string | undefined;
  const heroBackground = data.heroBackground as string | undefined;
  const trustItems = (data.trustItems as Array<{ icon?: string; text?: string }>) ?? [];
  const testimonials =
    (data.testimonials as Array<{ name?: string; quote?: string; rating?: number }>) ?? [];

  return (
    <>
      <section
        className="relative overflow-hidden"
        style={heroBackground ? { backgroundColor: heroBackground } : undefined}
      >
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-16 sm:py-24 lg:grid-cols-2">
          <div className={heroImage ? "text-left" : "text-center lg:col-span-2"}>
            <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
              925 Sterling Silver
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
              {heroTitle}
            </h1>
            {heroSubtitle && (
              <p className={`mt-4 max-w-xl text-muted-foreground ${heroImage ? "" : "mx-auto"}`}>
                {heroSubtitle}
              </p>
            )}
            <Button asChild size="lg" className="mt-8">
              <Link href={heroLink}>{heroCta}</Link>
            </Button>
          </div>
          {heroImage && (
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl">
              <Image
                src={heroImage}
                alt={heroTitle}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
                priority
              />
            </div>
          )}
        </div>
      </section>

      {trustItems.length > 0 && (
        <section className="border-y bg-muted/30">
          <div className="mx-auto flex max-w-6xl flex-wrap justify-center gap-x-10 gap-y-3 px-4 py-5">
            {trustItems.map((item, i) => (
              <span key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                {item.icon && <span aria-hidden>{item.icon}</span>}
                {item.text}
              </span>
            ))}
          </div>
        </section>
      )}

      {testimonials.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="mb-8 text-center text-xl font-semibold">What our customers say</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((t, i) => (
              <figure key={i} className="rounded-lg border p-5">
                {typeof t.rating === "number" && t.rating > 0 && (
                  <div className="mb-2 flex gap-0.5" aria-label={`${t.rating} out of 5 stars`}>
                    {Array.from({ length: Math.min(5, Math.round(t.rating)) }).map((_, s) => (
                      <Star key={s} className="h-4 w-4 fill-amber-400 text-amber-400" />
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
