import type { Prisma } from "@/generated/prisma/client";

export class InsufficientStockError extends Error {
  constructor(public productId: string) {
    super(`Insufficient stock for product ${productId}`);
    this.name = "InsufficientStockError";
  }
}

export type StockItem = { productId: string; quantity: number };

/**
 * Atomically decrements stock for every item inside the caller's transaction.
 * The `stock >= quantity` guard in the WHERE clause is the actual invariant —
 * a matched count of 0 means someone else took the stock first, and throwing
 * rolls back every decrement already applied in this transaction.
 */
export async function decrementStock(tx: Prisma.TransactionClient, items: StockItem[]) {
  for (const item of items) {
    const res = await tx.product.updateMany({
      where: { id: item.productId, isActive: true, stock: { gte: item.quantity } },
      data: { stock: { decrement: item.quantity } },
    });
    if (res.count !== 1) throw new InsufficientStockError(item.productId);
  }
}

/** Additive restore — no guard needed, stock can't go negative from adding. */
export async function restoreStock(tx: Prisma.TransactionClient, items: StockItem[]) {
  for (const item of items) {
    await tx.product.updateMany({
      where: { id: item.productId },
      data: { stock: { increment: item.quantity } },
    });
  }
}
