import { EditorialLink } from "@/components/storefront/editorial-link";

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
 */
export function EmptyCart() {
  return (
    <div className="border-t rhythm-commerce text-center">
      <p className="text-h3">Your cart is empty</p>
      <p className="mt-3 text-sm text-muted-foreground">
        Nothing here yet — the collection is a good place to start.
      </p>
      <div className="mt-8 flex justify-center">
        <EditorialLink href="/products">Browse all jewellery</EditorialLink>
      </div>
    </div>
  );
}
