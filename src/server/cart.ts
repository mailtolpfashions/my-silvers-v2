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

/** Quantity of one product already in the cart — 0 when absent. */
export async function getCartQuantityFor(userId: string, productId: string): Promise<number> {
  const item = await prisma.cartItem.findFirst({
    where: { cart: { userId }, productId },
    select: { quantity: true },
  });
  return item?.quantity ?? 0;
}

/** Thrown when the product sold out between the page rendering and the click. */
export class OutOfStockError extends Error {
  constructor() {
    super("OUT_OF_STOCK");
    this.name = "OutOfStockError";
  }
}

/** Thrown when the cart already holds every unit that remains in stock. */
export class StockLimitReachedError extends Error {
  constructor() {
    super("STOCK_LIMIT_REACHED");
    this.name = "StockLimitReachedError";
  }
}

export async function addToCart(userId: string, productId: string, quantity = 1) {
  const product = await prisma.product.findFirst({
    where: { id: productId, isActive: true },
  });
  if (!product) throw new Error("PRODUCT_UNAVAILABLE");

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
    where: { cartId_productId: { cartId: cart.id, productId } },
  });
  const currentQty = existing?.quantity ?? 0;

  // Cap at whatever is actually in stock, so the cart can never ask for more
  // than exists — which would otherwise only surface at checkout.
  const ceiling = Math.min(MAX_ITEM_QUANTITY, product.stock);
  if (currentQty >= ceiling) throw new StockLimitReachedError();

  const newQty = Math.min(ceiling, currentQty + qty);

  await prisma.cartItem.upsert({
    where: { cartId_productId: { cartId: cart.id, productId } },
    update: { quantity: newQty },
    create: { cartId: cart.id, productId, quantity: newQty },
  });
}

export async function setCartItemQuantity(userId: string, productId: string, quantity: number) {
  const cart = await prisma.cart.findUnique({ where: { userId } });
  if (!cart) return;

  const qty = Math.trunc(quantity);
  if (qty <= 0) {
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id, productId } });
    return;
  }
  await prisma.cartItem.updateMany({
    where: { cartId: cart.id, productId },
    data: { quantity: Math.min(MAX_ITEM_QUANTITY, qty) },
  });
}

export async function removeFromCart(userId: string, productId: string) {
  await prisma.cartItem.deleteMany({
    where: { cart: { userId }, productId },
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
