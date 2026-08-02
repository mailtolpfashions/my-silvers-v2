import type { Prisma } from "@/generated/prisma/client";

/**
 * Race-safe human-readable order numbers (MYS-000001) backed by the
 * `order_number_seq` Postgres sequence created in the init migration.
 * `nextval` is atomic — concurrent order creations can never collide.
 */
export async function nextOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ nextval: bigint }>>`SELECT nextval('order_number_seq')`;
  const seq = rows[0].nextval;
  return `MYS-${String(seq).padStart(6, "0")}`;
}
