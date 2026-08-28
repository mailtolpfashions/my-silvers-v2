import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { searchProducts, getActiveCategories } from "@/server/products/search";
import { getLiveBanner } from "@/server/cms/banners";
import { PageHeader } from "@/components/storefront/page-header";
import { ProductFilters } from "@/components/storefront/product-filters";
import { ProductGrid } from "@/components/storefront/product-grid";
import { ProductGridSkeleton } from "@/components/storefront/product-card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { StickyBarSpacer } from "@/components/storefront/sticky-action-bar";
import { PRODUCT_PAGE_SIZE } from "@/lib/product-page-size";
import { ItemListJsonLd, BreadcrumbJsonLd } from "@/components/storefront/structured-data";

/**
 * F-10 (audit, Aug 2026): this page had no metadata of its own, so the whole
 * catalogue inherited the root layout's title and shipped as a duplicate of the
 * homepage — "MY Silvers | Luxury 925 Sterling Silver Jewellery" on both. Two
 * pages competing on one title is a wasted result for the most commercially
 * important listing on the site.
 *
 * Static rather than generateMetadata, deliberately. This route is also the
 * search results page, and a title built from `q` would need searchParams —
 * which would opt the whole route out of the prerendered shell to personalise a
 * string no crawler indexes anyway. The listing is what search should find; the
 * results view is for someone already here.
 */
export const metadata: Metadata = {
  title: "All jewellery",
  description:
    "Every piece in the MY Silvers catalogue — hallmarked 925 sterling silver rings, earrings, necklaces, bracelets and anklets, made to be worn every day.",
  // This route is also search and the faceted listing, so every filtered and
  // sorted variant of it points back here as the one page worth indexing.
  alternates: { canonical: "/products" },
};

type SearchParams = Promise<{
  q?: string;
  category?: string;
  sort?: string;
  minPrice?: string;
  maxPrice?: string;
}>;

/**
 * The catalogue, and the search results page — they are the same route.
 *
 * The page shell awaits nothing, so the layout can prerender while the header
 * and the results stream in behind their own boundaries. Both children receive
 * the searchParams promise rather than an awaited value; awaiting it here would
 * pull the whole page back to request time.
 */
export default function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div>
      <Suspense fallback={<CatalogueHeaderSkeleton />}>
        <CatalogueHeader searchParams={searchParams} />
      </Suspense>

      <div className="container-page pt-10 rhythm-commerce-bottom">
        <Suspense fallback={<ResultsSkeleton />}>
          <Results searchParams={searchParams} />
        </Suspense>

        {/* Room for the pinned mobile filter bar, or it covers the last row. */}
        <StickyBarSpacer />
      </div>
    </div>
  );
}

/**
 * The editorial header.
 *
 * This page used to open with `<h1>Shop all jewellery</h1>` at 40px of padding
 * and nothing else, while every category page got a full-bleed banner — despite
 * this being the most-linked shopping page on the site.
 *
 * It is also the search results page, so a query for "oxidised" was landing on
 * a page headed "Shop all jewellery", which reads as a bug. When `q` is present
 * the heading says so and the artwork is dropped: a campaign photograph over a
 * set of search results is decoration in the way of the answer.
 */
async function CatalogueHeader({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = params.q?.trim();

  if (query) {
    return (
      <PageHeader
        eyebrow="Search"
        title={`Results for “${query}”`}
        description="Refine with the filters below, or try a different word."
      />
    );
  }

  // Position "catalogue" — an editor sets one banner and this page has a
  // header. With none published it falls back to the plain arrangement rather
  // than an empty frame.
  const banner = await getLiveBanner("catalogue");

  return (
    <PageHeader
      title="All jewellery"
      eyebrow={banner?.title}
      description="Hallmarked 925 sterling silver, made to be worn every day."
      image={banner?.image}
      imageHref={banner?.link}
    />
  );
}

/**
 * Filters, count and grid together, because they share one query.
 *
 * ProductFilters calls useSearchParams(), which is runtime data — it needs a
 * Suspense boundary above it or the whole route opts out of static rendering.
 * It gets one from the parent.
 */
async function Results({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  const filters = {
    q: params.q,
    category: params.category,
    sort: params.sort,
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
  };

  const [categories, { items, total }, midBanner] = await Promise.all([
    getActiveCategories(),
    // The first page is rendered on the server; ProductGrid appends the rest as
    // the shopper scrolls.
    searchProducts({
      q: params.q,
      categorySlug: params.category,
      sort: params.sort as "newest" | "price-asc" | "price-desc" | "featured" | undefined,
      minPrice: params.minPrice ? Number(params.minPrice) : undefined,
      maxPrice: params.maxPrice ? Number(params.maxPrice) : undefined,
      page: 1,
      pageSize: PRODUCT_PAGE_SIZE,
    }),
    getLiveBanner("catalogue-mid"),
  ]);

  const filterBar = (
    <ProductFilters
      categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
      current={filters}
      total={total}
    />
  );

  if (items.length === 0) {
    return (
      <>
        {filterBar}
        <div className="rhythm-commerce text-center">
          <p className="text-h3">Nothing matched those filters</p>
          <p className="mt-3 text-sm text-muted-foreground">
            Try removing a filter, or browse the full collection.
          </p>
          <div className="mt-8">
            <Link
              href="/products"
              className="inline-flex items-center border-b border-foreground pb-1 text-sm font-medium transition-colors hover:border-black hover:text-black"
            >
              View all jewellery
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Describes only the server-rendered first page — items appended by the
          infinite scroll are not in the document a crawler sees. */}
      <ItemListJsonLd items={items} name={params.q ? `Results for ${params.q}` : "All jewellery"} />
      <BreadcrumbJsonLd trail={[{ name: "All jewellery", path: "/products" }]} />
      {filterBar}
      <ProductGrid
        // Remount on filter change so appended pages never outlive their query.
        // Every filter must be in the key, or changing one leaves appended
        // pages from the previous query in place.
        key={[
          params.q ?? "",
          params.category ?? "",
          params.sort ?? "",
          params.minPrice ?? "",
          params.maxPrice ?? "",
        ].join("|")}
        initialItems={items}
        initialHasMore={total > PRODUCT_PAGE_SIZE}
        total={total}
        params={filters}
        // Only when an editor has actually published artwork for it. A fixed
        // index of 12 lands it after three rows on desktop and six on a phone.
        interrupt={
          midBanner
            ? { after: 12, node: <CatalogueBreak banner={midBanner} /> }
            : undefined
        }
      />
    </>
  );
}

/** The editorial pause inside a long grid. Photograph, one line, one link. */
function CatalogueBreak({
  banner,
}: {
  banner: { title?: string; image: string; link?: string };
}) {
  const art = (
    <div className="relative aspect-[16/5] w-full overflow-hidden bg-muted">
      <Image
        src={banner.image}
        alt=""
        fill
        loading="lazy"
        className="object-cover"
        sizes="100vw"
      />
      {banner.title && (
        <>
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent"
          />
          <div className="absolute inset-x-0 bottom-0 p-6 sm:p-10">
            <p className="text-h3 font-heading text-white">{banner.title}</p>
          </div>
        </>
      )}
    </div>
  );

  return banner.link ? (
    <Link href={banner.link} className="block">
      {art}
    </Link>
  ) : (
    art
  );
}

function CatalogueHeaderSkeleton() {
  // Matches PageHeader's plain mode, which is what renders without a banner.
  return (
    <div className="container-page rhythm-commerce-top">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="mt-4 h-4 w-full max-w-md" />
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <>
      <div className="hidden items-center justify-between border-b py-4 md:flex">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-24" />
      </div>
      <ProductGridSkeleton count={PRODUCT_PAGE_SIZE > 12 ? 12 : 8} />
    </>
  );
}
