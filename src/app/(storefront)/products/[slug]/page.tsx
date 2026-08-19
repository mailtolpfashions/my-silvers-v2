import { Suspense, ViewTransition } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { auth } from "@/server/auth/auth";
import { getProductBySlug } from "@/server/products/search";
import { isInWishlist, getCartQuantityFor } from "@/server/cart";
import { stockLabel, isScarce } from "@/lib/stock-label";
import { formatINR } from "@/lib/format";
import { ogImage } from "@/lib/og-image";
import { Skeleton } from "@/components/ui/skeleton";
import { AddToCartButton } from "@/components/storefront/add-to-cart-button";
import { BuyNowButton } from "@/components/storefront/buy-now-button";
import { SizeProvider, SizeSelector } from "@/components/storefront/size-selector";
import { StickyActionBar, STICKY_BAR_SPACER } from "@/components/storefront/sticky-action-bar";
import { WishlistButton } from "@/components/storefront/wishlist-button";
import { ShareButton } from "@/components/storefront/share-button";
import { ProductCard, productMorphName, PRODUCT_GRID_CLASS } from "@/components/storefront/product-card";
import { getSimilarProducts, getAlsoLikeProducts } from "@/server/products/recommendations";
import { RecordProductView, RecentlyViewed } from "@/components/storefront/recently-viewed";
import { ProductGallery } from "@/components/storefront/product-gallery";
import {
  ProductInfoSections,
  ProductInfoSectionsSkeleton,
} from "@/components/storefront/product-info-sections";
import { ReviewSection } from "@/components/storefront/reviews/review-section";
import { RevealSection } from "@/components/storefront/reveal-section";
import { SectionHeading } from "@/components/storefront/section-heading";
import { EditorialLink } from "@/components/storefront/editorial-link";
import { ProductJsonLd } from "@/components/storefront/structured-data";
import { ContentGap } from "@/components/storefront/content-gap";
import { isPagePublished } from "@/components/storefront/header/nav-model";

/**
 * The save/share pair at the top of the information rail. A little larger than
 * the 16px default, because at 16px on a column this wide they read as
 * decoration rather than controls.
 */
const PRODUCT_ACTION_ICON_CLASS = "size-11 text-muted-foreground [&_svg]:size-6";

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

  const description = product.shortDescription ?? product.description ?? undefined;
  const url = `/products/${product.slug}`;
  // The photograph a shopper sees when this link lands in WhatsApp. Padded to
  // 1200x630 and flattened to JPEG rather than handed over raw — see
  // src/lib/og-image.ts for why every part of that matters to an unfurler.
  const images = product.images[0] ? [ogImage(product.images[0], product.name)] : undefined;

  return {
    title: product.name,
    description,
    alternates: { canonical: url },
    // Spelled out rather than left to inherit. Next would derive og:title from
    // `title`, but it derives the TEMPLATED one — "Name | MY Silvers" — and the
    // site name is already its own line in the preview card.
    openGraph: {
      type: "website",
      url,
      title: product.name,
      description,
      images,
    },
    twitter: { card: "summary_large_image", title: product.name, description, images },
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

  // Cached under the `cms:page` tag, so this costs nothing per request and
  // starts resolving the moment an editor publishes the page.
  const sizeGuideHref = (await isPagePublished("size-guide")) ? "/p/size-guide" : undefined;

  return (
    <>
      {/* Behind a boundary: it runs a review aggregate, and nothing about the
          product should wait on structured data. Streamed JSON-LD is read
          correctly by search engines, which render the page. */}
      <Suspense fallback={null}>
        <ProductJsonLd product={product} />
      </Suspense>

      {/*
        The gallery is now the TALL column and the detail rail is the short
        one, which is the right way round and fixes a bug at the same time: the
        gallery used to be `sm:sticky` while also being the taller column, so
        there was never any overhang to stick against and it never engaged.

        `items-start` is what makes the sticky rail work at all — the default
        `stretch` gives both columns the height of the taller one, and a sticky
        element inside a full-height column has nothing to slide against.

        ── Equal halves, and why the two near-misses were worse ──────────────
        This has now been three things, so the reasoning is worth keeping.

        1.15fr gave the gallery 55% on the theory that the photographs deserve
        the room. That was written when the frame took whatever width the column
        offered; once the frame became square and capped to the window height it
        stopped growing with the column, and the surplus turned into a gap
        beside the picture rather than more picture.

        0.8fr then tried to shrink the column onto the frame. It very nearly
        did — within about 20px at 1920 — but it made the TEXT column the wider
        of the two, and a product page where the specifications are broader than
        the photograph reads as an admin form. Chasing an exact fit was the
        wrong goal anyway: the frame follows the window HEIGHT and the column
        follows the viewport WIDTH, so no single ratio can track it.

        So: equal halves, and the residue is handled rather than designed
        around. `grid-cols-2` is `minmax(0, 1fr)` twice, which is what keeps a
        long unbroken product name from pushing the rail wider than its share.

        At 1920 that is an 848px column holding a ~730px frame. The frame is
        left-aligned in it — see .product-frame in globals.css — so its left
        edge sits on the page gutter with everything else, and the leftover
        widens the channel between the two columns instead of floating the
        picture in the middle of nothing.
      */}
      {/* `product-page-top`, NOT the shared `rhythm-commerce-top`, and not that
          class with a `lg:pt-0` beside it — that combination was tried here and
          silently did nothing, because rhythm-commerce-top is unlayered and
          Tailwind utilities are not. The 80px stayed and the photograph paid for
          it. See the note on .product-page-top in globals.css.

          It matters more on this page than anywhere else: the gallery frame is
          a square capped by the window height, so every pixel above the grid
          comes straight off the picture. At 5rem the image was 732px on a 1080
          screen; at 1.5rem it is about 786. */}
      <div
        className={`container-page product-page-top grid items-start gap-10 lg:grid-cols-2 lg:gap-16 xl:gap-24 ${STICKY_BAR_SPACER}`}
      >
        <ProductGallery
          images={product.images}
          alt={product.name}
          videoUrl={product.videoUrl}
          morphSlot={
            image ? (
              // The receiving end of the card → product-page morph. The name
              // must match what the listing card used; see productMorphName.
              <ViewTransition name={productMorphName(product.id)} share="morph">
                {/* The LCP element of this page — eager, and given real
                    `sizes` so the browser doesn't download a full-width source
                    for a half-width slot. */}
                <Image
                  src={image}
                  alt={product.name}
                  fill
                  loading="eager"
                  fetchPriority="high"
                  // Narrower than the old 55vw: the gallery column was pulled
                  // in to meet the square frame, so this slot is about 42vw
                  // rather than 55. Must match product-gallery.tsx.
                  sizes="(max-width: 1024px) 100vw, 42vw"
                  className="object-cover"
                />
              </ViewTransition>
            ) : null
          }
        />

        {/* The information rail. Sticks to the top of the viewport once the
            gallery scrolls past it, so the price and the buy button are
            reachable from any point in a six-image stack.

            top-[7.5rem] clears both header bands (32 + 72) plus a little air. */}
        {/* A little more air than the gallery gets, so the breadcrumb is not
            level with the top edge of the photograph. Padding rather than a
            margin: this is the sticky element, and a margin would offset where
            it pins. */}
        <div className="lg:sticky lg:top-[7.5rem] lg:pt-4">
          {/* Top line of the rail: where you are on the left, what you can do
              with this page on the right.

              Save and share belong together and belong up here. Both are
              secondary to buying, so neither should sit in the CTA stack
              competing with it at the same width — but both are things a
              shopper reaches for while still looking at the photograph, which
              is the top of the page. */}
          <div className="flex items-start justify-between gap-4">
            {/* Breadcrumb doubles as the category link — the page previously had
                no route back into the catalogue except the header nav. */}
            <nav aria-label="Breadcrumb" className="min-w-0">
              <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <li>
                  <Link href="/products" className="transition-colors hover:text-foreground">
                    All jewellery
                  </Link>
                </li>
                <li aria-hidden>/</li>
                <li>
                  <Link
                    href={`/category/${product.category.slug}`}
                    // nav-back: a breadcrumb always moves up the hierarchy.
                    transitionTypes={["nav-back"]}
                    className="transition-colors hover:text-foreground"
                  >
                    {product.category.name}
                  </Link>
                </li>
              </ol>
            </nav>

            {/* `-mt-2 -mr-2` pulls the buttons' padding back out to the rail's
                edge, so the glyphs align with the column rather than sitting
                inset from it by their own hit area.

                No `initialInWishlist` here, deliberately: this heart is in the
                static shell, and giving it a server-known value would put a
                per-shopper read in front of the whole page. It reads the shared
                client store, exactly as every listing card does. */}
            <div className="-mr-2 -mt-2 flex shrink-0 items-center gap-1">
              <WishlistButton
                productId={product.id}
                surface="plain"
                className={PRODUCT_ACTION_ICON_CLASS}
              />
              <ShareButton
                url={`/products/${product.slug}`}
                title={product.name}
                className={PRODUCT_ACTION_ICON_CLASS}
              />
            </div>
          </div>

          {/* ── Price above the name ────────────────────────────────────────
              The order here was name → price, with the price at 14px regular so
              it sat one step quieter than the name. That is the same assumption
              the listing card used to make, and it is wrong for the same reason:
              this catalogue sells into a market where the price is the first
              question, not the last.

              The size moved with the position. Fourteen-point grey above a
              36-point name is not a lead — the eye still lands on the name, and
              all the reorder would have bought is a caption floating above a
              heading. 24px carries the line. Weight is what holds it back from
              reading as a discount sticker: medium, not the semibold this page
              once had at a smaller size.

              `incl. of all taxes` stays on the line rather than below it: it is
              a qualifier on the number, and Indian shoppers read an unqualified
              figure as the one before delivery and GST. */}
          <p className="mt-4 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="text-2xl font-medium text-foreground">
              {formatINR(product.price.toString())}
            </span>
            {product.compareAtPrice && (
              <span className="text-base text-muted-foreground line-through">
                {formatINR(product.compareAtPrice.toString())}
              </span>
            )}
            <span className="text-xs text-muted-foreground">incl. of all taxes</span>
          </p>

          {/* The Bestseller and Featured badges that used to sit beside this are
              gone — a badge on the page you are already on tells a shopper
              nothing they can act on, and they were the last two decorative
              pills on the storefront. */}
          <h1 className="text-h1 mt-2">{product.name}</h1>

          {product.shortDescription && (
            <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
              {product.shortDescription}
            </p>
          )}

          {/* Availability, and only when it says something. A green "In stock"
              dot on every product page is noise; one piece left is information.
              Never a count — see src/lib/stock-label.ts. */}
          {product.stock <= 0 ? (
            <p className="mt-5 text-sm text-destructive">Out of stock</p>
          ) : (
            isScarce(product.stock) && (
              <p className="mt-5 text-sm text-black">{stockLabel(product.stock)}</p>
            )
          )}

          {/* The provider wraps BOTH the selector and the CTA because they are
              siblings — the buttons have to read a choice made in the selector,
              and this page is a server component, so it cannot hold that state
              itself. */}
          <SizeProvider
            sizes={product.sizes}
            stockBySize={Object.fromEntries(product.variants.map((v) => [v.size, v.stock]))}
          >
            {/* The link is offered only when the page actually exists.
                `/p/size-guide` has never been written, and this pointed at it
                unconditionally — so the single most useful link on a ring
                product page was a 404. Ring sizing is also the biggest driver
                of silver returns, so the gap is worth making loud in dev. */}
            <SizeSelector sizeGuideHref={sizeGuideHref} />
            {product.sizes.length > 0 && !sizeGuideHref && (
              <ContentGap
                label="Size guide page (/p/size-guide)"
                detail="This product has sizes but there is no published size guide, so the 'Find your size' link is hidden. Ring sizing is the most common reason a silver order comes back — this page is worth writing."
                where="CMS → Pages → new page with slug 'size-guide'"
              />
            )}

            {/* The one place that keeps server-rendered per-shopper state: here
                the CTA is the page, so a flip from "Add to cart" to "In cart"
                after hydration would be jarring. Behind its own boundary so the
                product body doesn't wait on the session.

                The skeleton leaves quickly, the real CTA arrives more gently —
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
          </SizeProvider>

          {/* Expandable rows. The per-product measurements come from the
              Product row; materials, care and shipping come from the
              `product-info` CMS singleton, so they are written once rather than
              retyped on all 122 pieces.

              The four hardcoded trust claims that used to sit here are gone.
              They were JSX literals asserting "7-day returns on unworn pieces"
              while the CMS trust bar on the homepage said 15 days — the site
              contradicted itself on a refund policy, in two places a shopper
              could see in one session. */}
          <Suspense fallback={<ProductInfoSectionsSkeleton />}>
            <ProductInfoSections product={product} />
          </Suspense>
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
          categorySlug={product.category.slug}
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

  const shared = { productId, stock, isAuthed: !!userId, cartQuantity };

  return (
    <>
      {/* Desktop: one row, not two stacked blocks. Buy now leads — it is the
          action most shoppers who have decided will take — and it is the only
          filled one, so the hierarchy survives the two sitting side by side.

          Stacked and full-width they were two 52px bars running the whole width
          of the rail, which is a form's worth of furniture for two words each.
          `max-w-xl` caps the pair at 576px so they stay a control rather than a
          band across the page; the reference this design follows sets its single
          button at about 310px.

          `items-start` because Add to cart can grow a line of helper text
          underneath itself ("You've added all we have available") and the row
          must not stretch Buy now to match it.

          Each button is wrapped rather than given `flex-1` directly: both render
          their own `w-full` internals, and Add to cart's outer element is the
          div that carries that helper text.

          Save used to be a third block here. It is a heart at the top of the
          rail now: an outlined button the same width as Add to cart invited a
          shopper to weigh saving against buying, and saving does not deserve
          that much of the decision. */}
      <div className="mt-8 hidden items-start gap-3 md:flex lg:max-w-xl">
        <div className="flex-1">
          <BuyNowButton {...shared} />
        </div>
        <div className="flex-1">
          <AddToCartButton {...shared} />
        </div>
      </div>

      {/* Mobile: the same controls, pinned to the bottom of the viewport.
          Rendered from this component rather than a second one so auth() and
          the cart/wishlist reads happen once — two instances of the buttons are
          cheap, a second round of server queries is not.

          The buttons share one client store, so both copies stay in step; only
          one is ever visible. */}
      <StickyActionBar>
        {/* `plain` plus a bordered box: the overlay styling assumes it is
            floating over a product photo, where the translucent fill is the
            affordance. On a solid bar the border is what gives it an edge.

            This heart stays even though the rail now has one, because the whole
            point of the bar is that it is reachable from anywhere on a page
            that is mostly photography — the rail's heart is four screens up. */}
        <span className="flex size-11 shrink-0 items-center justify-center border">
          <WishlistButton
            productId={productId}
            initialInWishlist={inWishlist}
            surface="plain"
          />
        </span>
        {/* `compact` on Add to cart: the full version carries helper text under
            it, which would make the bar two lines tall. */}
        <div className="flex-1">
          <AddToCartButton {...shared} compact />
        </div>
        <div className="flex-1">
          <BuyNowButton {...shared} />
        </div>
      </StickyActionBar>
    </>
  );
}

/** Matches the real CTA stack's height so the rail doesn't shift as it resolves. */
function ProductCtaSkeleton() {
  return (
    <div className="mt-8 hidden gap-3 md:flex lg:max-w-xl">
      <Skeleton className="h-[52px] flex-1" />
      <Skeleton className="h-[52px] flex-1" />
    </div>
  );
}

async function Reviews({ productId, productSlug }: { productId: string; productSlug: string }) {
  const session = await auth();
  return (
    <ReviewSection productId={productId} productSlug={productSlug} isAuthed={!!session?.user?.id} />
  );
}

/** Same category, nearest in price — "more like this one". */
async function SimilarProducts({
  productId,
  categoryId,
  priceRupees,
  categoryName,
  categorySlug,
}: {
  productId: string;
  categoryId: string;
  priceRupees: number;
  categoryName: string;
  categorySlug: string;
}) {
  const items = await getSimilarProducts({ productId, categoryId, priceRupees });
  if (items.length === 0) return null;

  return (
    <ProductRow
      title="See similar"
      eyebrow={`More ${categoryName.toLowerCase()}`}
      // The slug, not the lower-cased NAME. "More rings" happened to work;
      // a category called "Ear Cuffs" produced /category/ear cuffs.
      viewAllHref={`/category/${categorySlug}`}
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
    <RevealSection className="container-page rhythm-commerce border-t">
      <SectionHeading title={title} eyebrow={eyebrow} />
      <div className={PRODUCT_GRID_CLASS}>
        {items.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      {/* Below the grid and centred, matching the homepage sections — see the
          note in section-heading.tsx for why it cannot sit beside the heading. */}
      {viewAllHref && (
        <div className="mt-12 flex justify-center">
          <EditorialLink href={viewAllHref}>View all</EditorialLink>
        </div>
      )}
    </RevealSection>
  );
}
