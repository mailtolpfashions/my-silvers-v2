import { prisma } from "@/server/db";
import { MAX_ITEM_QUANTITY } from "@/server/orders/money";

export async function getCartWithProducts(userId: string) {
  return prisma.cart.findUnique({
    where: { userId },
    include: {
      items: {
        include: { product: { include: { category: true } } },
        orderBy: { id: "asc" },
      },
    },
  });
}

/**
 * Total units in the cart, for the header badge. Aggregates in the database
 * rather than loading every item and its product just to sum a column.
 */
export async function getCartItemCount(userId: string): Promise<number> {
  const result = await prisma.cartItem.aggregate({
    where: { cart: { userId } },
    _sum: { quantity: true },
  });
  return result._sum.quantity ?? 0;
}

/**
 * Cart quantities for the whole cart, keyed by product id. Listing pages need
 * per-card state; one query beats one per card.
 */
export async function getCartQuantityMap(userId: string): Promise<Map<string, number>> {
  const items = await prisma.cartItem.findMany({
    where: { cart: { userId } },
    select: { productId: true, quantity: true },
  });
  // Summed, not assigned: one product can now occupy several rows, one per
  // size. Building the map by assignment would report only the last size's
  // quantity, so a card holding two sizes would read as one.
  const totals = new Map<string, number>();
  for (const item of items) {
    totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.quantity);
  }
  return totals;
}

/**
 * Ids of every product in the customer's wishlist. Covers the entire wishlist,
 * not one page, so infinite-scroll appends need no extra fetch.
 */
export async function getWishlistProductIds(userId: string): Promise<Set<string>> {
  const wishlist = await prisma.wishlist.findUnique({
    where: { userId },
    select: { products: { select: { id: true } } },
  });
  return new Set((wishlist?.products ?? []).map((p) => p.id));
}

/**
 * Quantity of one product already in the cart, across every size — 0 when
 * absent. Aggregated because a shopper can hold two sizes of the same design.
 */
export async function getCartQuantityFor(userId: string, productId: string): Promise<number> {
  const result = await prisma.cartItem.aggregate({
    where: { cart: { userId }, productId },
    _sum: { quantity: true },
  });
  return result._sum.quantity ?? 0;
}

/** Thrown when the product sold out between the page rendering and the click. */
export class OutOfStockError extends Error {
  constructor() {
    super("OUT_OF_STOCK");
    this.name = "OutOfStockError";
  }
}

/** Thrown when a sized product is added without a valid size. */
export class SizeRequiredError extends Error {
  constructor() {
    super("SIZE_REQUIRED");
    this.name = "SizeRequiredError";
  }
}

/** Thrown when the cart already holds every unit that remains in stock. */
export class StockLimitReachedError extends Error {
  constructor() {
    super("STOCK_LIMIT_REACHED");
    this.name = "StockLimitReachedError";
  }
}

/**
 * Validates the chosen size against the product's own list.
 *
 * Never trust the string from the client: it decides what gets picked and
 * shipped, so a value that is not on the product is rejected outright rather
 * than stored. A product with no sizes always resolves to "".
 */
function resolveSize(productSizes: string[], requested: string | undefined): string {
  if (productSizes.length === 0) return "";
  const match = productSizes.find((s) => s === requested);
  if (!match) throw new SizeRequiredError();
  return match;
}

export async function addToCart(
  userId: string,
  productId: string,
  quantity = 1,
  size?: string,
) {
  const product = await prisma.product.findFirst({
    where: { id: productId, isActive: true },
  });
  if (!product) throw new Error("PRODUCT_UNAVAILABLE");

  const chosenSize = resolveSize(product.sizes, size);

  // Stock is re-read here, not trusted from the page the customer is looking
  // at — it may have been rendered minutes ago. This is a courtesy check for a
  // clear, early error; the binding guarantee is still the conditional UPDATE
  // in decrementStock() at order time. Nothing is reserved by adding to a cart.
  if (product.stock <= 0) throw new OutOfStockError();

  const qty = Math.max(1, Math.min(MAX_ITEM_QUANTITY, Math.trunc(quantity) || 1));
  const cart = await prisma.cart.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  const existing = await prisma.cartItem.findUnique({
    where: { cartId_productId_size: { cartId: cart.id, productId, size: chosenSize } },
  });
  const currentQty = existing?.quantity ?? 0;

  // Cap at whatever is actually in stock, so the cart can never ask for more
  // than exists — which would otherwise only surface at checkout.
  const ceiling = Math.min(MAX_ITEM_QUANTITY, product.stock);
  if (currentQty >= ceiling) throw new StockLimitReachedError();

  const newQty = Math.min(ceiling, currentQty + qty);

  await prisma.cartItem.upsert({
    where: { cartId_productId_size: { cartId: cart.id, productId, size: chosenSize } },
    update: { quantity: newQty },
    create: { cartId: cart.id, productId, size: chosenSize, quantity: newQty },
  });
}

export async function setCartItemQuantity(
  userId: string,
  productId: string,
  quantity: number,
  size = "",
) {
  const cart = await prisma.cart.findUnique({ where: { userId } });
  if (!cart) return;

  const qty = Math.trunc(quantity);
  // Scoped by size too, or changing the quantity of ring size 7 would silently
  // change size 9 along with it.
  if (qty <= 0) {
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id, productId, size } });
    return;
  }
  await prisma.cartItem.updateMany({
    where: { cartId: cart.id, productId, size },
    data: { quantity: Math.min(MAX_ITEM_QUANTITY, qty) },
  });
}

/**
 * Removes one line. The size argument is part of the identity — omitting it
 * would clear every size of this product at once.
 */
export async function removeFromCart(userId: string, productId: string, size = "") {
  await prisma.cartItem.deleteMany({
    where: { cart: { userId }, productId, size },
  });
}

export async function toggleWishlist(userId: string, productId: string): Promise<boolean> {
  const wishlist = await prisma.wishlist.upsert({
    where: { userId },
    update: {},
    create: { userId },
    include: { products: { where: { id: productId }, select: { id: true } } },
  });

  const has = wishlist.products.length > 0;
  await prisma.wishlist.update({
    where: { id: wishlist.id },
    data: {
      products: has ? { disconnect: { id: productId } } : { connect: { id: productId } },
    },
  });
  return !has; // true = now in wishlist
}

export async function getWishlistProducts(userId: string) {
  const wishlist = await prisma.wishlist.findUnique({
    where: { userId },
    include: { products: { where: { isActive: true }, include: { category: true } } },
  });
  return wishlist?.products ?? [];
}

export async function isInWishlist(userId: string, productId: string): Promise<boolean> {
  const wishlist = await prisma.wishlist.findUnique({
    where: { userId },
    include: { products: { where: { id: productId }, select: { id: true } } },
  });
  return (wishlist?.products.length ?? 0) > 0;
}
