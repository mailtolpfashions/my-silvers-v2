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
import { productMorphName } from "@/components/storefront/product-card";
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

      <Suspense fallback={null}>
        <Reviews productId={product.id} productSlug={product.slug} />
      </Suspense>
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
