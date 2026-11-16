import { prisma } from "@/server/db";
import { getStoreSettings } from "@/server/settings/store-settings";
import { formatINR } from "@/lib/format";
import { C, esc, thumb, type Help } from "@/server/email/layout";

/**
 * Everything an order email shows, loaded in one place so the confirmation,
 * the cancellation and the owner's new-order alert describe an order the
 * same way — the same photos, the same breakdown, the same address.
 */
export type OrderEmailData = NonNullable<Awaited<ReturnType<typeof loadOrderEmailData>>>;

type Address = {
  fullName?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
};

export async function loadOrderEmailData(orderId: string) {
  const [order, settings] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { select: { name: true, image: true, size: true, quantity: true, price: true } },
        user: { select: { name: true, email: true } },
      },
    }),
    getStoreSettings(),
  ]);
  if (!order) return null;

  const address = (order.shippingAddress ?? {}) as Address;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    cod: order.paymentMethod === "cod",
    confirmationToken: order.confirmationToken,
    email: order.user.email,
    firstName: (address.fullName || order.user.name || "").trim().split(/\s+/)[0] || null,
    items: order.items.map((i) => ({
      name: i.name,
      image: i.image,
      size: i.size || null,
      quantity: i.quantity,
      price: Number(i.price),
    })),
    subtotal: Number(order.subtotal),
    discount: Number(order.discount),
    couponCode: order.couponCode,
    shipping: Number(order.shippingCharge),
    giftWrap: Number(order.giftWrapCharge),
    total: Number(order.totalAmount),
    isGift: order.isGift,
    giftMessage: order.giftMessage,
    address,
    delivery: deliveryWindow(order.createdAt, settings),
    help: { whatsapp: settings.whatsappNumber || undefined, email: "support@mysilvers.in" } as Help,
  };
}

/**
 * "Thu, 20 Nov – Mon, 24 Nov": the order date plus the dispatch and transit
 * days the owner set in Settings, counted in working days (Sundays skipped —
 * couriers don't deliver then). Null when Settings states no delivery time:
 * a guessed date is a promise the shop never made.
 */
export function deliveryWindow(
  from: Date,
  s: { handlingTimeMinDays: number; handlingTimeMaxDays: number; transitTimeMinDays: number; transitTimeMaxDays: number }
): string | null {
  const min = s.handlingTimeMinDays + s.transitTimeMinDays;
  const max = s.handlingTimeMaxDays + s.transitTimeMaxDays;
  if (max <= 0) return null;
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(d);
  const a = fmt(addWorkingDays(from, Math.max(min, 1)));
  const b = fmt(addWorkingDays(from, max));
  return a === b ? b : `${a} – ${b}`;
}

function addWorkingDays(from: Date, days: number): Date {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    // Sunday in India — the date in IST, not UTC.
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Asia/Kolkata" }).format(d);
    if (weekday !== "Sun") left -= 1;
  }
  return d;
}

export function formatOrderDate(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(d);
}

/** The items, each with its photo, size and quantity, priced on the right. */
export function itemsTable(
  items: Array<{ name: string; image?: string | null; size: string | null; quantity: number; price?: number }>
): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items
    .map((i, n) => {
      const border = n === 0 ? "" : `border-top:1px solid ${C.hairline};`;
      const meta = [i.size ? `Size ${esc(i.size)}` : "", `Qty ${i.quantity}`].filter(Boolean).join(" &middot; ");
      return `<tr>
  <td width="84" valign="top" style="padding:12px 12px 12px 0;${border}">${thumb(i.image)}</td>
  <td valign="top" style="padding:12px 0;${border}">
    <div style="font-size:15px;line-height:21px;font-weight:600;color:${C.black}">${esc(i.name)}</div>
    <div style="padding-top:4px;font-size:13px;color:${C.muted}">${meta}</div>
  </td>
  ${
    i.price === undefined
      ? ""
      : `<td valign="top" align="right" style="padding:12px 0 12px 12px;white-space:nowrap;font-size:15px;font-weight:600;color:${C.black};${border}">${formatINR(i.price * i.quantity)}</td>`
  }
</tr>`;
    })
    .join("")}</table>`;
}

/**
 * Subtotal, savings, shipping and the total. The saving is stated in words
 * and in green ("You saved ₹200") — the shop's rule is that a saving is said
 * outright, never left as arithmetic for the shopper.
 */
export function priceSummary(d: OrderEmailData): string {
  const row = (k: string, v: string, color: string = C.ink) =>
    `<tr><td style="padding:4px 0;font-size:14px;color:${C.muted}">${k}</td><td align="right" style="padding:4px 0;font-size:14px;color:${color}">${v}</td></tr>`;
  const rows = [
    row("Subtotal", formatINR(d.subtotal)),
    d.discount > 0
      ? row(`Discount${d.couponCode ? ` (${esc(d.couponCode)})` : ""}`, `&minus;${formatINR(d.discount)}`, C.saving)
      : "",
    row("Shipping", d.shipping > 0 ? formatINR(d.shipping) : "FREE", d.shipping > 0 ? C.ink : C.saving),
    d.giftWrap > 0 ? row("Gift wrap", formatINR(d.giftWrap)) : "",
  ].join("");
  const saved =
    d.discount > 0
      ? `<tr><td colspan="2" style="padding:8px 0 0;font-size:13px;font-weight:600;color:${C.saving}">You saved ${formatINR(d.discount)} on this order</td></tr>`
      : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;border-top:1px solid ${C.hairline};padding-top:8px">
${rows}
<tr><td style="padding:10px 0 0;border-top:1px solid ${C.hairline};font-size:16px;font-weight:700;color:${C.black}">${d.cod ? "To pay on delivery" : "Amount paid"}</td>
<td align="right" style="padding:10px 0 0;border-top:1px solid ${C.hairline};font-size:18px;font-weight:700;color:${C.black}">${formatINR(d.total)}</td></tr>
${saved}
</table>`;
}

/** The delivery address as the courier will read it. */
export function addressBlock(a: Address, withPhone = true): string {
  const lines = [
    `<strong style="color:${C.black}">${esc(a.fullName)}</strong>`,
    esc(a.addressLine1),
    a.addressLine2 ? esc(a.addressLine2) : "",
    [esc(a.city), esc(a.state)].filter(Boolean).join(", ") + (a.pincode ? ` &ndash; ${esc(a.pincode)}` : ""),
    withPhone && a.phone ? `Phone: ${esc(a.phone)}` : "",
  ].filter(Boolean);
  return lines.join("<br>");
}
