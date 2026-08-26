import { EditorialLink } from "@/components/storefront/editorial-link";
import { RecentlyViewed } from "@/components/storefront/recently-viewed";

/**
 * The empty cart, shared by the signed-in and guest flows.
 *
 * Its own module rather than an export from the cart page: guest-cart-view is a
 * client component, and importing from that page would pull the page's module
 * graph — auth() and therefore Prisma — into the browser bundle. It typechecks
 * and then fails at build with "the chunking context does not support external
 * modules (request: node:module)".
 *
 * Nothing here imports from the server layer, so both flows can use it.
 * RecentlyViewed is safe for the same reason: it is a client component reading
 * localStorage, so it brings no server code with it.
 */
export function EmptyCart() {
  return (
    <>
      <div className="border-t rhythm-commerce text-center">
        <p className="text-h3">Your cart is empty</p>
        <p className="mt-3 text-sm text-muted-foreground">
          Nothing here yet — the collection is a good place to start.
        </p>
        <div className="mt-8 flex justify-center">
          <EditorialLink href="/products">Browse all jewellery</EditorialLink>
        </div>
      </div>

      {/**
       * Somewhere to go, rather than a dead end.
       *
       * The screen was a heading, one sentence and a link, then several hundred
       * pixels of nothing before the footer — the most expensive empty state on
       * the site, since every other one at least sits beside something.
       *
       * ⚠️  Recently viewed, NOT the cart recommendations used on the full-cart
       * branch. Those are add-on suggestions: they cap at ₹3,500 because "past
       * it, it's a second purchase, not an add-on", and with no subtotal to
       * work from they clamp to the ₹1,500 floor. That would open the shop with
       * its cheapest stock to someone who has just emptied their basket.
       *
       * What that shopper was looking at a moment ago is the better offer, and
       * it is usually why they are on this page at all — they removed
       * something, or came back to a basket that had expired.
       *
       * It brings its own heading and section chrome, and renders nothing at
       * all when there is no history, so it needs no wrapper and no guard here.
       */}
      <RecentlyViewed />
    </>
  );
}
