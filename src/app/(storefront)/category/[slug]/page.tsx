import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getCategoryBanner, type LiveBanner } from "@/server/cms/banners";
import { prisma } from "@/server/db";
import { searchProducts } from "@/server/products/search";
import { ProductCard, productMorphName, PRODUCT_GRID_CLASS } from "@/components/storefront/product-card";
import { ProductFilters } from "@/components/storefront/product-filters";
import { StickyBarSpacer } from "@/components/storefront/sticky-action-bar";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = await prisma.category.findFirst({ where: { slug, isActive: true } });
  // noindex for unknown slugs — see the note in collections/[slug]/page.tsx.
  if (!category) return { title: "Not found", robots: { index: false, follow: false } };
  return { title: category.name, description: category.description ?? undefined };
}

type CategorySearchParams = Promise<{
  sort?: string;
  minPrice?: string;
  maxPrice?: string;
}>;

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: CategorySearchParams;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  // The listing no longer depends on the category row, so all three can be in
  // flight at once — this used to be a two-step waterfall.
  const [category, { items, total }, banner] = await Promise.all([
    prisma.category.findFirst({ where: { slug, isActive: true } }),
    searchProducts({
      categorySlug: slug,
      sort: sp.sort as "newest" | "price-asc" | "price-desc" | "featured" | undefined,
      minPrice: sp.minPrice ? Number(sp.minPrice) : undefined,
      maxPrice: sp.maxPrice ? Number(sp.maxPrice) : undefined,
    }),
    getCategoryBanner(slug),
  ]);
  if (!category) notFound();

  return (
    <>
      {/* The banner sits OUTSIDE container-page so it can run edge to edge.
          Deliberately not the `calc(50% - 50vw)` bleed used elsewhere: html now
          sets scrollbar-gutter: stable, so 100vw is wider than the content box
          by the scrollbar and that trick overflows the page sideways. */}
      {banner ? (
        <CategoryHeader category={category} banner={banner} />
      ) : (
        // No banner for this category — fall back to the plain stacked header
        // rather than leaving the page with no h1.
        <div className="container-page pt-10">
          <h1 className="text-h1">{category.name}</h1>
          {category.description && (
            <p className="text-lead mt-2 max-w-prose text-muted-foreground">
              {category.description}
            </p>
          )}
        </div>
      )}

      <div className="container-page py-10">
        {/* Sort and price, same control as the catalogue. No category picker
            here — the URL already decided that, and offering one would only be a
            way out of the page you're on. */}
        {/* Suspense because ProductFilters calls useSearchParams, which is
            runtime data — without a boundary this route can't prerender a shell. */}
        {/* The fallback is desktop-only: below md the filters are a pinned
            bottom bar, and reserving 96px at the top for them would be a hole
            in the page. */}
        <Suspense fallback={<div className="hidden h-24 md:block" aria-hidden />}>
          <ProductFilters
            current={{ sort: sp.sort, minPrice: sp.minPrice, maxPrice: sp.maxPrice }}
          />
        </Suspense>
        <p className="mt-3 text-sm text-muted-foreground">{total} products</p>

        {items.length === 0 ? (
          <p className="mt-16 text-center text-muted-foreground">
            No products match those filters.
          </p>
        ) : (
          <div className={`mt-8 ${PRODUCT_GRID_CLASS}`}>
            {items.map((product) => (
              <ProductCard key={product.id} product={product} morphName={productMorphName(product.id)} />
            ))}
          </div>
        )}

        {/* Room for the pinned filter bar, or it covers the last row. */}
        <StickyBarSpacer />
      </div>
    </>
  );
}

/**
 * Full-bleed category banner with the page heading laid over it.
 *
 * The banner's own CMS title is demoted to an eyebrow above the h1. It used to
 * be the only text here, so leaving it as a heading would put "Rings" and
 * "Rings for every day" side by side saying the same thing twice.
 *
 * `banner.link` is honoured on the artwork only, never on the heading — an h1
 * that navigates somewhere else is a trap, and on a category page the shopper
 * is already where that link would most plausibly send them.
 */
function CategoryHeader({
  category,
  banner,
}: {
  category: { name: string; description: string | null };
  banner: LiveBanner;
}) {
  // 16:4 gives the wide, shallow shape at desktop widths (400px at 1600px), but
  // the same ratio is only 192px at 768px — not enough for a heading plus a
  // description. min-height is the floor: below ~1440px the banner stops
  // shrinking and letterboxes the artwork rather than clipping the copy.
  return (
    <section className="relative aspect-[16/4] min-h-[360px] w-full overflow-hidden bg-graphite-950">
      {banner.link ? (
        <Link href={banner.link} aria-label={banner.title ?? category.name} className="absolute inset-0">
          <BannerArt banner={banner} />
        </Link>
      ) : (
        <BannerArt banner={banner} />
      )}

      {/* Scrim: strongest at the left where the copy sits, clearing by 70% so
          the artwork still reads. Sized against an arbitrary uploaded photo,
          which is the case this has to survive. */}
      <div
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
            {/* Only a banner targeted at THIS category may speak for it. The
                catch-all banner's title is generic by definition, and printing
                it here put "Rings for every day" above the Earrings heading. */}
            {banner.title && banner.targeted && (
              <p className="label-eyebrow label-eyebrow-light mb-4">{banner.title}</p>
            )}
            <h1 className="text-h1 font-heading text-white">{category.name}</h1>
            {category.description && (
              <p className="text-lead mt-3 text-white/80">{category.description}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function BannerArt({ banner }: { banner: LiveBanner }) {
  return (
    <Image
      src={banner.image}
      alt=""
      fill
      // Above the fold on every category page, so it carries the LCP.
      preload
      className="object-cover object-center"
      sizes="100vw"
    />
  );
}
