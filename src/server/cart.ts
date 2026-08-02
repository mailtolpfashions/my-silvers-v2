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

export async function addToCart(userId: string, productId: string, quantity = 1) {
  const product = await prisma.product.findFirst({
    where: { id: productId, isActive: true },
  });
  if (!product) throw new Error("PRODUCT_UNAVAILABLE");

  const qty = Math.max(1, Math.min(MAX_ITEM_QUANTITY, Math.trunc(quantity) || 1));
  const cart = await prisma.cart.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  const existing = await prisma.cartItem.findUnique({
    where: { cartId_productId: { cartId: cart.id, productId } },
  });
  const newQty = Math.min(MAX_ITEM_QUANTITY, (existing?.quantity ?? 0) + qty);

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
