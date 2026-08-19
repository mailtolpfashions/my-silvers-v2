import "server-only";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require-role";

/**
 * Carts with something in them that never became an order.
 *
 * ── What counts as abandoned ─────────────────────────────────────────────────
 * A cart with items whose most recent activity is older than a threshold, held
 * by someone with no order placed since. The second half matters: without it a
 * shopper who buys and then starts a new basket shows up as having abandoned
 * the thing they just paid for.
 *
 * ── The clock is on the ITEM ─────────────────────────────────────────────────
 * CartItem.updatedAt, aggregated to a max per cart — see the note on the field.
 * The Cart row is never written when a line changes, so a timestamp there would
 * be frozen at creation.
 *
 * ⚠️  Guest carts are invisible here, and always will be. They live in the
 * browser's localStorage (src/lib/guest-cart.ts) and never reach the database,
 * so this screen only ever shows signed-in shoppers. Do not present the totals
 * as "all abandoned revenue" — they are a floor, not the number.
 */

/** Ignore anything touched more recently than this; it is still being shopped. */
const STALE_AFTER_HOURS = 4;

/**
 * Ceiling on how many carts are examined.
 *
 * ⚠️  The abandoned/not-abandoned test needs each cart's items and the owner's
 * last order, so it cannot be expressed as a WHERE clause and has to run in
 * memory. That means this cannot be paginated the usual way, and the cap is
 * what stops it loading the entire cart table with every line item attached
 * once the shop has real traffic.
 *
 * If it is ever actually being hit, the fix is a scheduled job that marks carts
 * abandoned — not a bigger number here.
 */
const MAX_CARTS_SCANNED = 500;

export type AbandonedCart = {
  cartId: string;
  userId: string;
  customerName: string;
  email: string;
  phone: string | null;
  lastActivity: Date;
  itemCount: number;
  value: number;
  items: Array<{ name: string; slug: string; image: string | null; quantity: number; size: string; price: number }>;
  /** Orders this customer has ever placed. Zero means they never bought. */
  orderCount: number;
};

export async function listAbandonedCarts(q?: string): Promise<AbandonedCart[]> {
  await requireRole("admin");

  const cutoff = new Date(Date.now() - STALE_AFTER_HOURS * 60 * 60 * 1000);
  const search = q?.trim();

  const carts = await prisma.cart.findMany({
    where: {
      items: { some: {} },
      // Matched against the SHOPPER, not the products in the basket: the reason
      // to search this screen is to find the person you are about to message.
      ...(search
        ? {
            user: {
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { email: { contains: search, mode: "insensitive" as const } },
                { phone: { contains: search } },
              ],
            },
          }
        : {}),
    },
    // Oldest carts first: activity lives on the items, so the cart's own
    // creation date is the closest proxy the database can sort on. The value
    // sort at the end of this function fixes the presentation order.
    orderBy: { createdAt: "asc" },
    take: MAX_CARTS_SCANNED,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          _count: { select: { orders: true } },
          orders: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
      items: {
        include: { product: { select: { name: true, slug: true, images: true, price: true } } },
      },
    },
  });

  return carts
    .map((cart) => {
      const lastActivity = cart.items.reduce<Date>(
        (latest, item) => (item.updatedAt > latest ? item.updatedAt : latest),
        cart.items[0]?.updatedAt ?? cart.createdAt,
      );
      return { cart, lastActivity };
    })
    .filter(({ cart, lastActivity }) => {
      if (lastActivity > cutoff) return false;
      // Bought since they last touched the basket — not abandoned, just left
      // over. Showing these would send a "you forgot something" nudge to
      // someone who did not forget.
      const lastOrder = cart.user.orders[0]?.createdAt;
      return !lastOrder || lastOrder < lastActivity;
    })
    .map(({ cart, lastActivity }) => ({
      cartId: cart.id,
      userId: cart.user.id,
      customerName: cart.user.name ?? cart.user.email,
      email: cart.user.email,
      phone: cart.user.phone,
      lastActivity,
      itemCount: cart.items.reduce((sum, i) => sum + i.quantity, 0),
      value: cart.items.reduce((sum, i) => sum + Number(i.product.price.toString()) * i.quantity, 0),
      orderCount: cart.user._count.orders,
      items: cart.items.map((i) => ({
        name: i.product.name,
        slug: i.product.slug,
        image: i.product.images[0] ?? null,
        quantity: i.quantity,
        size: i.size,
        price: Number(i.product.price.toString()),
      })),
    }))
    .sort((a, b) => b.value - a.value);
}
