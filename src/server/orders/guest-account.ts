import bcrypt from "bcryptjs";
import { prisma } from "@/server/db";

/**
 * "Save this order to an account" — letting a guest set a password from their
 * order page, so they can sign in later instead of needing a lookup.
 *
 * The order link (id + confirmationToken) is the only proof we hold, and it
 * proves possession of ONE order, not of the email address. Guest emails are
 * unverified, and resolveGuestUser() reuses an existing user row by email, so
 * the row behind this order might also hold someone else's guest orders — for
 * instance two people who both typed test@gmail.com. Setting a password on
 * that row would hand this shopper the other person's orders and address.
 *
 * So this is allowed only when the row is unmistakably just this order:
 *   - no password yet (a real account must go through its own sign-in),
 *   - no Google or other linked sign-in,
 *   - exactly one order — this one.
 * Anything else is refused, and the page simply doesn't offer the option.
 */

type Order = { id: string; userId: string };

async function loadOrder(orderId: string, token: string): Promise<Order | null> {
  if (!token) return null;
  return prisma.order.findFirst({
    where: { id: orderId, confirmationToken: token },
    select: { id: true, userId: true },
  });
}

async function isClaimable(userId: string): Promise<{ email: string } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      passwordHash: true,
      role: true,
      _count: { select: { orders: true, accounts: true } },
    },
  });
  if (!user) return null;
  if (user.role !== "customer") return null;
  if (user.passwordHash) return null;
  if (user._count.accounts > 0) return null;
  if (user._count.orders !== 1) return null;
  return { email: user.email };
}

/** The email the account would sign in with, or null when not offered. */
export async function getClaimableAccountEmail(orderId: string, token: string) {
  const order = await loadOrder(orderId, token);
  if (!order) return null;
  return (await isClaimable(order.userId))?.email ?? null;
}

export class GuestAccountError extends Error {}

/**
 * Sets the password and returns the email to sign in with. The update is
 * conditional on the password still being empty, so two tabs racing cannot
 * both set one.
 */
export async function claimGuestAccount(orderId: string, token: string, password: string) {
  const order = await loadOrder(orderId, token);
  if (!order) throw new GuestAccountError("not_found");
  const claimable = await isClaimable(order.userId);
  if (!claimable) throw new GuestAccountError("not_claimable");

  const passwordHash = await bcrypt.hash(password, 12);
  const { count } = await prisma.user.updateMany({
    where: { id: order.userId, passwordHash: null },
    data: { passwordHash },
  });
  if (count !== 1) throw new GuestAccountError("not_claimable");
  return claimable.email;
}
