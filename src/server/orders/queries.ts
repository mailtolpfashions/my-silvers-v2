import { prisma } from "@/server/db";

export async function getUserOrders(userId: string) {
  return prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { items: true },
  });
}

export async function getUserOrder(orderId: string, userId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, userId },
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
