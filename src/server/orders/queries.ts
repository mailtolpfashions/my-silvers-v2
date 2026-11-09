import { prisma } from "@/server/db";
import { accountOrderScope } from "@/server/auth/email-verification";

/** The signed-in shopper, as the session has them. */
export type OrderOwner = { id: string; pwf?: string };

/**
 * An account's orders. Scoped by accountOrderScope, which hides guest orders
 * until the email is confirmed — see server/auth/email-verification.ts.
 */
export async function getUserOrders(owner: OrderOwner) {
  return prisma.order.findMany({
    where: await accountOrderScope(owner),
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { items: true },
  });
}

export async function getUserOrder(orderId: string, owner: OrderOwner) {
  return prisma.order.findFirst({
    where: { id: orderId, ...(await accountOrderScope(owner)) },
    include: { items: true },
  });
}

/** Guest tokenized access — the confirmationToken IS the credential. */
export async function getPublicOrderByToken(orderId: string, confirmationToken: string) {
  if (!confirmationToken) return null;
  return prisma.order.findFirst({
    where: { id: orderId, confirmationToken },
    include: { items: true },
  });
}
