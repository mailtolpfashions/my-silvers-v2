import { Suspense, ViewTransition } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ShieldCheck, RotateCcw, Truck, Gift } from "lucide-react";
import { auth } from "@/server/auth/auth";
import { getProductBySlug } from "@/server/products/search";
import { isInWishlist, getCartQuantityFor } from "@/server/cart";
import { stockLabel, isScarce } from "@/lib/stock-label";
import { formatINR } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AddToCartButton } from "@/components/storefront/add-to-cart-button";
import { WishlistButton } from "@/components/storefront/wishlist-button";
import { ProductCard, productMorphName, PRODUCT_GRID_CLASS } from "@/components/storefront/product-card";
import { getSimilarProducts, getAlsoLikeProducts } from "@/server/products/recommendations";
import { RecordProductView, RecentlyViewed } from "@/components/storefront/recently-viewed";
import { ProductGallery } from "@/components/storefront/product-gallery";
import { ReviewSection } from "@/components/storefront/reviews/review-section";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  // Under Cache Components the static shell commits a 200 before we know
  // whether the product exists, so a missing slug renders the not-found UI at
  // status 200 rather than 404. noindex is what keeps those soft 404s out of
  // search results. See the note in collections/[slug]/page.tsx.
  if (!product) return { title: "Not found", robots: { index: false, follow: false } };
  return {
    title: product.name,
    description: product.shortDescription ?? product.description ?? undefined,
    ...(product.images[0] ? { openGraph: { images: [product.images[0]] } } : {}),
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) notFound();

  const image = product.images[0];

  return (
    <>
      <div className="container-detail grid gap-10 py-10 sm:grid-cols-2">
        <ProductGallery
          images={product.images}
          alt={product.name}
          videoUrl={product.videoUrl}
          morphSlot={
            image ? (
              // The receiving end of the card → product-page morph. The name
              // must match what the listing card used; see productMorphName.
              <ViewTransition name={productMorphName(product.id)} share="morph">
                {/* The LCP element of this page — preloaded, and given real
                    `sizes` so the browser doesn't download a full-width source
                    for a half-width slot. */}
                <Image
                  src={image}
                  alt={product.name}
                  fill
                  preload
                  sizes="(max-width: 640px) 100vw, 45vw"
                  className="object-cover"
                />
              </ViewTransition>
            ) : null
          }
        />

        <div>
          {/* Breadcrumb doubles as the category link — the page previously had
              no route back into the catalogue except the header nav. */}
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <li>
                <Link href="/products" className="transition-colors hover:text-foreground">
                  All Jewellery
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li>
                <Link
                  href={`/category/${product.category.slug}`}
                  // nav-back: a breadcrumb always moves up the hierarchy.
                  transitionTypes={["nav-back"]}
                  className="uppercase tracking-wide transition-colors hover:text-foreground"
                >
                  {product.category.name}
                </Link>
              </li>
            </ol>
          </nav>
          <h1 className="mt-2 text-h2">{product.name}</h1>

          <div className="mt-3 flex items-center gap-2">
            {product.isBestseller && <Badge variant="secondary">Bestseller</Badge>}
            {product.isFeatured && <Badge variant="outline">Featured</Badge>}
          </div>

          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-2xl font-semibold">{formatINR(product.price.toString())}</span>
            {product.compareAtPrice && (
              <span className="text-muted-foreground line-through">
                {formatINR(product.compareAtPrice.toString())}
              </span>
            )}
          </div>

          <p className="mt-6 text-sm text-muted-foreground">{product.description}</p>

          <dl className="mt-6 space-y-1 text-sm">
            <div className="flex justify-between border-b py-2">
              <dt className="text-muted-foreground">Purity</dt>
              <dd>{product.purity}</dd>
            </div>
            {product.weight && (
              <div className="flex justify-between border-b py-2">
                <dt className="text-muted-foreground">Weight</dt>
                <dd>{product.weight.toString()}g</dd>
              </div>
            )}
            {product.material && (
              <div className="flex justify-between border-b py-2">
                <dt className="text-muted-foreground">Material</dt>
                <dd>{product.material}</dd>
              </div>
            )}
            {product.dimensions && (
              <div className="flex justify-between border-b py-2">
                <dt className="text-muted-foreground">Dimensions</dt>
                <dd>{product.dimensions}</dd>
              </div>
            )}
            {product.sizes.length > 0 && (
              <div className="flex justify-between border-b py-2">
                <dt className="text-muted-foreground">Available sizes</dt>
                <dd>{product.sizes.join(", ")}</dd>
              </div>
            )}
            {/* Stored and admin-editable but never shown until now — shoppers
                quote it in enquiries and it helps them tell variants apart. */}
            <div className="flex justify-between border-b py-2">
              <dt className="text-muted-foreground">SKU</dt>
              <dd className="text-muted-foreground">{product.sku}</dd>
            </div>
            <div className="flex justify-between border-b py-2">
              <dt className="text-muted-foreground">Availability</dt>
              <dd className={isScarce(product.stock) ? "font-medium text-brass-text" : ""}>
                {stockLabel(product.stock)}
              </dd>
            </div>
          </dl>

          {/* The one place that keeps server-rendered per-shopper state: here
              the CTA is the page, so a flip from "Add to cart" to "In cart"
              after hydration would be jarring. Behind its own boundary so the
              product body doesn't wait on the session. */}
          {/* The skeleton leaves quickly, the real CTA arrives more gently —
              see the .reveal-out/.reveal-in rules in globals.css. `default:
              "none"` keeps this from firing during the image morph. */}
          <Suspense
            fallback={
              <ViewTransition exit="reveal-out">
                <ProductCtaSkeleton />
              </ViewTransition>
            }
          >
            <ViewTransition enter="reveal-in" default="none">
              <ProductCta productId={product.id} stock={product.stock} />
            </ViewTransition>
          </Suspense>

          {/* Reassurance at the point of decision. Silver jewellery online is a
              trust purchase — hallmarking and returns are the two objections
              that stop a first-time buyer, and neither was answered anywhere on
              this page. */}
          <ul className="mt-8 space-y-3 border-t pt-6">
            {[
              { icon: ShieldCheck, text: "BIS hallmarked 925 sterling silver" },
              { icon: RotateCcw, text: "7-day returns on unworn pieces" },
              { icon: Truck, text: "Free shipping on orders above ₹999" },
              { icon: Gift, text: "Gift box and anti-tarnish pouch included" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-muted-foreground">
                <Icon className="size-4 shrink-0 text-brass-text" aria-hidden />
                {text}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Records this view in localStorage. Renders nothing, and deliberately
          client-side: writing views server-side would make every product page
          unique per shopper and undo the caching. */}
      <RecordProductView productId={product.id} />

      {/* Each behind its own boundary so a recommendation query can never hold
          up the product itself. */}
      <Suspense fallback={null}>
        <SimilarProducts
          productId={product.id}
          categoryId={product.categoryId}
          priceRupees={Number(product.price)}
          categoryName={product.category.name}
        />
      </Suspense>

      <Suspense fallback={null}>
        <AlsoLike productId={product.id} categoryId={product.categoryId} />
      </Suspense>

      <Suspense fallback={null}>
        <Reviews productId={product.id} productSlug={product.slug} />
      </Suspense>

      {/* Last: it's the shopper's own trail, least likely to be what they want
          next, and it reads from localStorage so it only appears after hydration. */}
      <RecentlyViewed excludeProductId={product.id} />
    </>
  );
}

async function ProductCta({ productId, stock }: { productId: string; stock: number }) {
  const session = await auth();
  const userId = session?.user?.id;
  const [inWishlist, cartQuantity] = userId
    ? await Promise.all([isInWishlist(userId, productId), getCartQuantityFor(userId, productId)])
    : [false, 0];

  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
      <AddToCartButton
        productId={productId}
        stock={stock}
        isAuthed={!!userId}
        cartQuantity={cartQuantity}
      />
      <WishlistButton productId={productId} initialInWishlist={inWishlist} />
    </div>
  );
}

/** Matches the real CTA row's height so the page doesn't shift as it resolves. */
function ProductCtaSkeleton() {
  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
      <Skeleton className="h-9 w-full sm:w-40" />
      <Skeleton className="h-9 w-full sm:w-32" />
    </div>
  );
}

async function Reviews({ productId, productSlug }: { productId: string; productSlug: string }) {
  const session = await auth();
  return (
    <ReviewSection
      productId={productId}
      productSlug={productSlug}
      isAuthed={!!session?.user?.id}
    />
  );
}

/** Same category, nearest in price — "more like this one". */
async function SimilarProducts({
  productId,
  categoryId,
  priceRupees,
  categoryName,
}: {
  productId: string;
  categoryId: string;
  priceRupees: number;
  categoryName: string;
}) {
  const items = await getSimilarProducts({ productId, categoryId, priceRupees });
  if (items.length === 0) return null;

  return (
    <ProductRow
      title="See similar"
      eyebrow={`More ${categoryName.toLowerCase()}`}
      viewAllHref={`/category/${categoryName.toLowerCase()}`}
      items={items}
    />
  );
}

/** Outside the category — the cross-sell rather than more of the same. */
async function AlsoLike({ productId, categoryId }: { productId: string; categoryId: string }) {
  const items = await getAlsoLikeProducts({ productId, categoryId });
  if (items.length === 0) return null;

  return <ProductRow title="You may also like" eyebrow="From the collection" items={items} />;
}

/**
 * Shared shell for the recommendation rows.
 *
 * No morphName on these cards: the same product can legitimately appear in two
 * rows on this page, and a duplicate view-transition-name makes the browser
 * abandon the morph for the whole document.
 */
function ProductRow({
  title,
  eyebrow,
  viewAllHref,
  items,
}: {
  title: string;
  eyebrow?: string;
  viewAllHref?: string;
  items: Awaited<ReturnType<typeof getAlsoLikeProducts>>;
}) {
  return (
    <section className="container-page border-t py-14">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          {eyebrow && <p className="label-eyebrow mb-2">{eyebrow}</p>}
          <h2 className="text-h2">{title}</h2>
        </div>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="text-sm font-medium text-brass-text underline underline-offset-4"
          >
            View all
          </Link>
        )}
      </div>
      <div className={PRODUCT_GRID_CLASS}>
        {items.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
