import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { getPublishedEntry } from "@/server/cms/entries";
import { getProductsByTag } from "@/server/products/search";
import { RichText } from "@/components/storefront/cms/rich-text";
import {
  ProductCard,
  productMorphName,
  PRODUCT_GRID_CLASS,
} from "@/components/storefront/product-card";
import { Button } from "@/components/ui/button";
import { CollectionPageSkeleton } from "./skeleton";

type Params = Promise<{ slug: string }>;

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
export default function CollectionPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<CollectionPageSkeleton />}>
      <CollectionBody params={params} />
    </Suspense>
  );
}

async function CollectionBody({ params }: { params: Params }) {
  const { slug } = await params;
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

  // The collection's own products, via Product.tags. Until this existed the
  // page could only offer a generic link to the full catalogue.
  const tag = d.productTag?.trim();
  const products = tag ? await getProductsByTag(tag) : [];

  return (
    <div>
      <section className="relative">
        {d.heroImage && (
          <div className="relative aspect-[21/9] w-full overflow-hidden bg-muted">
            <Image src={d.heroImage} alt={d.title ?? ""} fill className="object-cover" preload />
          </div>
        )}
        <div className="container-prose py-12 text-center">
          {d.eyebrow && <p className="label-eyebrow">{d.eyebrow}</p>}
          <h1 className="mt-3 text-h1">{d.title}</h1>
          {d.description && (
            <p className="mt-4 text-muted-foreground">{d.description}</p>
          )}
          {/* Only worth a CTA out to the catalogue when this collection has no
              products of its own to show. */}
          {products.length === 0 && (
            <Button asChild size="lg" className="mt-6">
              <Link href="/products">{d.cta || "Shop now"}</Link>
            </Button>
          )}
        </div>
      </section>

      {d.story && (
        <section className="container-prose pb-16">
          <RichText html={d.story} />
        </section>
      )}

      {products.length > 0 && (
        <section className="container-page pb-20">
          <h2 className="mb-8 text-h2">Pieces in this collection</h2>
          <div className={PRODUCT_GRID_CLASS}>
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                morphName={productMorphName(product.id)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
