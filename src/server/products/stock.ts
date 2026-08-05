import type { Prisma } from "@/generated/prisma/client";

export class InsufficientStockError extends Error {
  constructor(public productId: string) {
    super(`Insufficient stock for product ${productId}`);
    this.name = "InsufficientStockError";
  }
}

/** `size` is "" for products that have none. */
export type StockItem = { productId: string; quantity: number; size?: string };

/**
 * Atomically decrements stock for every item inside the caller's transaction.
 *
 * The `stock >= quantity` guard in the WHERE clause is the actual invariant — a
 * matched count of 0 means someone else took the stock first, and throwing rolls
 * back every decrement already applied in this transaction.
 *
 * For a sized item the guard is on the ProductVariant row, because that is the
 * stock a shopper is actually buying: checking only the product total would
 * happily sell the last size 6 twice as long as some size 9 remained.
 *
 * Product.stock is decremented alongside it. It is a maintained total, not a
 * second source of truth — see the note on the field in schema.prisma — so both
 * writes must happen in the same transaction or the two drift apart.
 */
export async function decrementStock(tx: Prisma.TransactionClient, items: StockItem[]) {
  for (const item of items) {
    const size = item.size ?? "";

    if (size) {
      const variant = await tx.productVariant.updateMany({
        where: { productId: item.productId, size, stock: { gte: item.quantity } },
        data: { stock: { decrement: item.quantity } },
      });
      // Also covers a size that no longer exists: no row matches, count is 0.
      if (variant.count !== 1) throw new InsufficientStockError(item.productId);
    }

    // Still guarded even when the variant check already passed. If the two ever
    // drift, this fails loudly and rolls back rather than driving the total
    // negative.
    const product = await tx.product.updateMany({
      where: { id: item.productId, isActive: true, stock: { gte: item.quantity } },
      data: { stock: { decrement: item.quantity } },
    });
    if (product.count !== 1) throw new InsufficientStockError(item.productId);
  }
}

/** Additive restore — no guard needed, stock can't go negative from adding. */
export async function restoreStock(tx: Prisma.TransactionClient, items: StockItem[]) {
  for (const item of items) {
    const size = item.size ?? "";

    if (size) {
      // updateMany, not update: a size retired since the order was placed has no
      // row, and a cancellation must not fail because of that. The units are
      // then returned to the product total only, which an admin can rebalance.
      await tx.productVariant.updateMany({
        where: { productId: item.productId, size },
        data: { stock: { increment: item.quantity } },
      });
    }

    await tx.product.updateMany({
      where: { id: item.productId },
      data: { stock: { increment: item.quantity } },
    });
  }
}
