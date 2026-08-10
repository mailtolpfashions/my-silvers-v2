import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublishedEntry } from "@/server/cms/entries";
import { getProductsByTag } from "@/server/products/search";
import { RichText } from "@/components/storefront/cms/rich-text";
import {
  ProductCard,
  productMorphName,
  PRODUCT_GRID_CLASS,
} from "@/components/storefront/product-card";
import { PageHeader } from "@/components/storefront/page-header";
import { EditorialLink } from "@/components/storefront/editorial-link";
import { CollectionSort } from "@/components/storefront/collection-sort";
import { StickyBarSpacer } from "@/components/storefront/sticky-action-bar";
import { ItemListJsonLd, BreadcrumbJsonLd } from "@/components/storefront/structured-data";
import { CollectionPageSkeleton } from "./skeleton";
import type { ProductListItem } from "@/server/products/search";

type Params = Promise<{ slug: string }>;
type CollectionSearchParams = Promise<{ sort?: string }>;

/**
 * Deliberately no generateStaticParams.
 *
 * Collections are CMS content, so their slugs change without a redeploy — a
 * build-time param list would go stale. Under Cache Components that also means
 * params are runtime data, so the body below must sit inside <Suspense>; the
 * shell prerenders and the content streams.
 *
 * The trade-off: because the shell commits a 200 before we know whether the
 * collection exists, a missing slug renders the not-found UI at status 200
 * rather than 404. generateMetadata marks those noindex so search engines drop
 * them. See docs: dynamic-routes.md "With Cache Components".
 */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getPublishedEntry("collection", slug);
  // Keep unknown slugs out of the index — this is what stops the soft 404
  // above from accumulating junk pages in search results.
  if (!collection) return { title: "Not found", robots: { index: false, follow: false } };
  const d = collection.data as { title?: string; description?: string };
  return {
    title: collection.seo.metaTitle ?? d.title,
    description: collection.seo.metaDescription ?? d.description,
  };
}

/** Themed collection landing pages (bridal, daily wear, festive…). */
export default function CollectionPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: CollectionSearchParams;
}) {
  return (
    <Suspense fallback={<CollectionPageSkeleton />}>
      <CollectionBody params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * Sorting is applied here rather than in the query.
 *
 * getProductsByTag is a cached read keyed on the tag alone — adding a sort
 * parameter would multiply its cache entries by four for what is at most a few
 * dozen rows. Ordering a resolved array is cheaper than a second cache key.
 *
 * The underlying order remains featured-then-newest and is NOT curatable:
 * membership rides on Product.tags with no join table, so there is nowhere to
 * store a hand-picked position. That is a known and accepted limitation — see
 * the note in server/products/search.ts.
 */
function sortItems(items: ProductListItem[], sort?: string): ProductListItem[] {
  const sorted = [...items];
  switch (sort) {
    case "price-asc":
      return sorted.sort((a, b) => Number(a.price) - Number(b.price));
    case "price-desc":
      return sorted.sort((a, b) => Number(b.price) - Number(a.price));
    case "featured":
      return sorted.sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured));
    default:
      return sorted;
  }
}

async function CollectionBody({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: CollectionSearchParams;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const collection = await getPublishedEntry("collection", slug);
  if (!collection) notFound();

  const d = collection.data as {
    title?: string;
    eyebrow?: string;
    description?: string;
    story?: string;
    heroImage?: string;
    cta?: string;
    productTag?: string;
  };

  // The collection's own products, via Product.tags.
  const tag = d.productTag?.trim();
  const products = sortItems(tag ? await getProductsByTag(tag) : [], sp.sort);

  const title = d.title ?? slug;

  return (
    <div>
      <ItemListJsonLd items={products} name={title} />
      <BreadcrumbJsonLd
        trail={[
          { name: "Collections", path: "/collections" },
          { name: title, path: `/collections/${slug}` },
        ]}
      />

      <PageHeader
        title={title}
        eyebrow={d.eyebrow}
        description={d.description}
        image={d.heroImage}
      />

      {d.story && (
        <section className="container-prose pt-10 rhythm-commerce-bottom">
          {/* The one other place the serif appears. A collection story is
              editorial writing, not UI. */}
          <RichText html={d.story} className="prose-headings:font-serif" />
        </section>
      )}

      {products.length > 0 ? (
        <section className="container-page pt-10 rhythm-commerce-bottom">
          <div className="flex items-center justify-between gap-6 border-b pb-4">
            <span className="text-sm text-muted-foreground">
              {products.length} {products.length === 1 ? "piece" : "pieces"}
            </span>
            <Suspense fallback={<div className="h-5 w-24" aria-hidden />}>
              <CollectionSort current={sp.sort} />
            </Suspense>
          </div>

          <div className={`mt-8 ${PRODUCT_GRID_CLASS}`}>
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                morphName={productMorphName(product.id)}
              />
            ))}
          </div>
          <StickyBarSpacer />
        </section>
      ) : (
        // Nothing tagged into this collection yet — offer the catalogue rather
        // than leaving the page with a story and no way forward.
        <section className="container-page pt-10 rhythm-commerce-bottom text-center">
          <EditorialLink href="/products">{d.cta || "Browse all jewellery"}</EditorialLink>
        </section>
      )}
    </div>
  );
}
