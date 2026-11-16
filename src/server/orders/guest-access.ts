import { prisma } from "@/server/db";

/**
 * A guest's proof that an order is theirs: the order id plus the
 * confirmationToken from their email link.
 *
 * A guest has no password. Their order still belongs to a real (passwordless)
 * User row — resolveGuestUser created it at checkout — but nothing signs them
 * in as it. The private link in their emails is the only credential they hold,
 * and it is already what lets them see the order at /orders/[id]?ot=… So the
 * same link now lets them do the two things a buyer does after delivery:
 * review what they received, and ask for a return.
 *
 * Every use re-checks the token server-side; the browser only carries it.
 */
export type GuestOrderAccess = { orderId: string; token: string };

export function isGuestAccess(v: unknown): v is GuestOrderAccess {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as GuestOrderAccess).orderId === "string" &&
    typeof (v as GuestOrderAccess).token === "string" &&
    (v as GuestOrderAccess).token.length > 0
  );
}

/**
 * The order and its owner's user id when the token matches — and, with
 * `delivered`, only once the order has been delivered (reviews and returns
 * both start there). Null otherwise.
 */
export async function resolveGuestOrder(
  access: GuestOrderAccess,
  opts: { delivered?: boolean } = {}
): Promise<{ orderId: string; userId: string } | null> {
  const order = await prisma.order.findFirst({
    where: {
      id: access.orderId,
      confirmationToken: access.token,
      ...(opts.delivered ? { orderStatus: "delivered" as const } : {}),
    },
    select: { id: true, userId: true },
  });
  return order ? { orderId: order.id, userId: order.userId } : null;
}
