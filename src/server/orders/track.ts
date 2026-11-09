import { prisma } from "@/server/db";

/**
 * "Track order" lookup for shoppers who are not signed in.
 *
 * Takes the order number AND the email or mobile it was placed with. Both are
 * required, deliberately:
 *   - order number alone → anyone could walk MYS-000001, MYS-000002… and read
 *     strangers' names, addresses and purchases (the numbers are sequential);
 *   - email/mobile alone → anyone who knows a customer's phone number could do
 *     the same.
 *
 * Mobile is accepted as well as email because guest checkout does not verify
 * the email. A typo there means the confirmation never arrives, but the mobile
 * is almost always right — the courier has to be able to call it.
 *
 * Every miss returns the same `null`, so a caller cannot tell "no such order"
 * from "wrong contact detail" and learn which order numbers exist.
 */

export type TrackLookup =
  /** A guest order: open its tokenised page. */
  | { kind: "guest"; orderId: string; token: string }
  /** Placed from an account: the shopper has to sign in to see it. */
  | { kind: "account"; orderId: string };

/**
 * Accepts what people actually type: "MYS-000123", "mys000123", "#MYS 000123",
 * or just "123". Returns the canonical MYS-000123, or null when it cannot be an
 * order number at all.
 */
export function normaliseOrderNumber(raw: string): string | null {
  const digits = raw.toUpperCase().replace(/^\s*#?\s*MYS/, "").replace(/[\s-]/g, "");
  if (!/^\d{1,9}$/.test(digits)) return null;
  const n = Number(digits);
  if (n <= 0) return null;
  return `MYS-${String(n).padStart(6, "0")}`;
}

/**
 * An Indian mobile as stored on orders: bare 10 digits. Mirrors the
 * normalisation in phoneSchema (lib/validation/account.ts), which is what the
 * checkout wrote into shippingAddress.phone.
 */
function normaliseMobile(raw: string): string | null {
  const value = raw.trim().replace(/[\s\-()]/g, "");
  if (!/^(\+?91|0)?[6-9]\d{9}$/.test(value)) return null;
  return value.replace(/^(\+?91|0)/, "");
}

export async function findOrderForTracking(
  orderNumberInput: string,
  contactInput: string,
): Promise<TrackLookup | null> {
  const orderNumber = normaliseOrderNumber(orderNumberInput);
  if (!orderNumber) return null;

  const order = await prisma.order.findUnique({
    where: { orderNumber },
    select: {
      id: true,
      confirmationToken: true,
      shippingAddress: true,
      user: { select: { email: true, phone: true } },
    },
  });
  if (!order) return null;

  const contact = contactInput.trim();
  let matches = false;

  if (contact.includes("@")) {
    matches = order.user.email.toLowerCase() === contact.toLowerCase();
  } else {
    const mobile = normaliseMobile(contact);
    if (mobile) {
      // The address snapshot is the number this order was placed with; the
      // account's phone is a fallback for older orders that lack one.
      const address = (order.shippingAddress ?? {}) as { phone?: unknown };
      const shipPhone = typeof address.phone === "string" ? normaliseMobile(address.phone) : null;
      const userPhone = order.user.phone ? normaliseMobile(order.user.phone) : null;
      matches = mobile === shipPhone || mobile === userPhone;
    }
  }

  if (!matches) return null;

  return order.confirmationToken
    ? { kind: "guest", orderId: order.id, token: order.confirmationToken }
    : { kind: "account", orderId: order.id };
}
