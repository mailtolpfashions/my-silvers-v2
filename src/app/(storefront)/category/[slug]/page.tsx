import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCategoryBanner } from "@/server/cms/banners";
import { prisma } from "@/server/db";
import { searchProducts } from "@/server/products/search";
import { ProductCard, productMorphName, PRODUCT_GRID_CLASS } from "@/components/storefront/product-card";
import { ProductFilters } from "@/components/storefront/product-filters";
import { PageHeader } from "@/components/storefront/page-header";
import { StickyBarSpacer } from "@/components/storefront/sticky-action-bar";
import { ItemListJsonLd, BreadcrumbJsonLd } from "@/components/storefront/structured-data";

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
  q?: string;
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
      q: sp.q,
      sort: sp.sort as "newest" | "price-asc" | "price-desc" | "featured" | undefined,
      minPrice: sp.minPrice ? Number(sp.minPrice) : undefined,
      maxPrice: sp.maxPrice ? Number(sp.maxPrice) : undefined,
    }),
    getCategoryBanner(slug),
  ]);
  if (!category) notFound();

  return (
    <>
      <ItemListJsonLd items={items} name={category.name} />
      <BreadcrumbJsonLd
        trail={[
          { name: "All jewellery", path: "/products" },
          { name: category.name, path: `/category/${category.slug}` },
        ]}
      />

      {/* Only a banner targeted at THIS category may speak for it. The
          catch-all banner's title is generic by definition, and printing it
          here put "Rings for every day" above the Earrings heading. */}
      <PageHeader
        title={category.name}
        eyebrow={banner?.targeted ? banner.title : undefined}
        description={category.description}
        image={banner?.image}
        imageHref={banner?.link}
      />

      <div className="container-page pt-10 rhythm-commerce-bottom">
        {/* No category picker here — the URL already decided that, and offering
            one would only be a way out of the page you're on.

            Suspense because ProductFilters calls useSearchParams, which is
            runtime data; without a boundary this route can't prerender a shell. */}
        <Suspense fallback={<div className="hidden h-[57px] border-b md:block" aria-hidden />}>
          <ProductFilters
            current={{ sort: sp.sort, minPrice: sp.minPrice, maxPrice: sp.maxPrice, q: sp.q }}
            total={total}
          />
        </Suspense>

        {items.length === 0 ? (
          <div className="rhythm-commerce text-center">
            <p className="text-h3">Nothing matched those filters</p>
            <p className="mt-3 text-sm text-muted-foreground">
              Try removing a filter to see everything in {category.name.toLowerCase()}.
            </p>
          </div>
        ) : (
          <div className={`mt-8 ${PRODUCT_GRID_CLASS}`}>
            {items.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                morphName={productMorphName(product.id)}
              />
            ))}
          </div>
        )}

        {/* Room for the pinned filter bar, or it covers the last row. */}
        <StickyBarSpacer />
      </div>
    </>
  );
}
