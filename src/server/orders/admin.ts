import { prisma } from "@/server/db";
import { accountOrderScope } from "@/server/auth/email-verification";
import type { OrderStatus } from "@/generated/prisma/client";
import { restoreStock } from "@/server/products/stock";
import type { SortDir } from "@/server/products/admin";
import type { PaymentStatus } from "@/generated/prisma/client";
import { toPaise } from "@/server/orders/money";
import { COMING_BACK_FILTER, UNPAID_ATTEMPTS_FILTER } from "@/lib/order-coming-back";
import {
  formatDeadline,
  isReturnWindowOpen,
  returnDeadline,
  windowLength,
} from "@/lib/return-window";
import { createRefund } from "@/server/payments/razorpay";
import {
  activePartners,
  bookCourier,
  pickupAndLabel,
  quoteAll,
  type BookingRequest,
  type BookingResult,
} from "@/server/couriers";
import { PROVIDER_LABEL, type CourierProviderId } from "@/lib/courier-quotes";
import { getStoreSettings } from "@/server/settings/store-settings";
import { releaseShipmentByOrderId } from "@/server/orders/cancel-shipment";

export class AdminOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminOrderError";
  }
}

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  await prisma.order.update({ where: { id: orderId }, data: { orderStatus: status } });

  // The dropdown no longer offers 'cancelled' (see lib/order-status-moves.ts),
  // but if a caller ever sets it here, never leave a live waybill at Shiprocket
  // for an order that no longer exists.
  if (status === "cancelled") {
    await releaseShipmentByOrderId(orderId);
  }
}

type ShippingAddress = {
  fullName?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
};

/**
 * Everything a courier partner needs to know about the parcel, built once
 * from the order. Product weights are stored in GRAMS; each partner converts
 * to its own unit (see server/couriers).
 */
async function loadShippable(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, user: true },
  });
  if (!order) throw new AdminOrderError("Order not found.");
  if (order.paymentMethod === "razorpay" && order.paymentStatus !== "paid") {
    throw new AdminOrderError("Cannot ship an unpaid online order.");
  }
  const address = (order.shippingAddress ?? {}) as ShippingAddress;
  const weightGrams = order.items.reduce((sum, i) => sum + Number(i.weight ?? 0) * i.quantity, 0);
  const total = Number(order.totalAmount);

  const request: BookingRequest = {
    orderNumber: order.orderNumber,
    orderDate: order.createdAt,
    customer: {
      name: address.fullName ?? order.user.name ?? "Customer",
      email: order.user.email,
      phone: address.phone ?? order.user.phone ?? "",
    },
    address: {
      addressLine1: address.addressLine1 ?? "",
      addressLine2: address.addressLine2,
      city: address.city ?? "",
      state: address.state ?? "",
      pincode: address.pincode ?? "",
    },
    items: order.items.map((i) => ({
      name: i.name,
      sku: i.productId ? `SKU-${i.productId}` : `ITEM-${i.id}`,
      units: i.quantity,
      sellingPrice: Number(i.price),
    })),
    paymentMethod: order.paymentMethod === "cod" ? "COD" : "Prepaid",
    subTotal: Number(order.subtotal),
    // Shiprocket's unit, with its 0.5 kg courier minimum.
    weightKg: Math.max(0.5, weightGrams / 1000),
    weightGrams: Math.max(1, weightGrams),
    orderTotal: total,
    existingShiprocket:
      order.shiprocketOrderId && order.shiprocketShipmentId
        ? { orderId: order.shiprocketOrderId, shipmentId: order.shiprocketShipmentId }
        : null,
  };
  return { order, request, pincode: address.pincode ?? "" };
}

/**
 * Prices from every courier partner switched on in Settings, cheapest first —
 * what the Ship order dialog shows. Free: rate checks book nothing.
 */
export async function getShippingQuotes(orderId: string) {
  const { order, request, pincode } = await loadShippable(orderId);
  if (order.trackingNumber) {
    throw new AdminOrderError(`A courier is already booked (${order.trackingNumber}).`);
  }
  if (!/^\d{6}$/.test(pincode)) throw new AdminOrderError("The delivery address has no valid pincode.");

  const settings = await getStoreSettings();
  const partners = activePartners(settings.courierPartners);
  if (partners.length === 0) {
    throw new AdminOrderError("No courier partner is connected — switch one on in Settings.");
  }
  return quoteAll(partners, {
    deliveryPincode: pincode,
    weightGrams: request.weightGrams,
    cod: request.paymentMethod === "COD",
    orderValueRupees: request.orderTotal,
  });
}

/**
 * Book the courier the admin picked — ⚠️ the call that spends money.
 *
 * Exactly once: the order is claimed (no AWB yet, still before shipping →
 * shipped) BEFORE any partner is called, so a double click or two admins
 * can't buy two waybills for one parcel. If the partner fails, the claim is
 * handed back and the admin can retry or pick another courier.
 *
 * shipmentCreatedAt is set only once a waybill exists — it means "dispatched",
 * and the customer's right to cancel is guarded on it.
 */
export async function bookShipment(
  orderId: string,
  provider: CourierProviderId,
  courierId: string,
  quotedTotal: number | null
): Promise<BookingResult> {
  const { order, request } = await loadShippable(orderId);
  if (order.trackingNumber) {
    throw new AdminOrderError(`A courier is already booked (${order.trackingNumber}).`);
  }
  const settings = await getStoreSettings();
  if (!activePartners(settings.courierPartners).includes(provider)) {
    throw new AdminOrderError(`${PROVIDER_LABEL[provider]} is switched off or not connected.`);
  }

  const before = order.orderStatus;
  const claim = await prisma.order.updateMany({
    where: {
      id: orderId,
      trackingNumber: null,
      shipmentCreatedAt: null,
      orderStatus: { in: ["placed", "confirmed", "processing"] },
    },
    data: { orderStatus: "shipped", courierProvider: provider },
  });
  if (claim.count === 0) throw new AdminOrderError("Order is not in a shippable state.");

  let booked: BookingResult;
  try {
    booked = await bookCourier(provider, courierId, request, quotedTotal);
  } catch (err) {
    // Hand the claim back, or the order is stranded as 'shipped' with no
    // waybill and nobody can retry.
    await prisma.order.updateMany({
      where: { id: orderId, trackingNumber: null, orderStatus: "shipped" },
      data: {
        orderStatus: before,
        // Back to what it was — unless the Shiprocket registration was just
        // cancelled for a NimbusPost attempt, in which case nothing is left.
        courierProvider: provider === "nimbuspost" ? null : order.courierProvider,
        // A NimbusPost booking cancels the free Shiprocket registration first.
        ...(provider === "nimbuspost" && order.shiprocketOrderId
          ? { shiprocketOrderId: null, shiprocketShipmentId: null }
          : {}),
      },
    });
    throw err;
  }

  await prisma.order.update({
    where: { id: orderId },
    data: {
      trackingNumber: booked.awb,
      trackingUrl: booked.trackingUrl || null,
      courierName: booked.courierName,
      shipmentCreatedAt: new Date(),
      shippingCost: booked.charged,
      ...(booked.shiprocket
        ? { shiprocketOrderId: booked.shiprocket.orderId, shiprocketShipmentId: booked.shiprocket.shipmentId }
        : {}),
      ...(booked.nimbuspostOrderId
        ? { nimbuspostOrderId: booked.nimbuspostOrderId, shiprocketOrderId: null, shiprocketShipmentId: null }
        : {}),
    },
  });
  return booked;
}

/**
 * Schedule the courier pickup and fetch the label, with whichever partner
 * booked the parcel. One action because it is one physical act — print the
 * label, stick it on, the courier comes. Not billable; safe to repeat (a label
 * is often wanted again after a printer jam).
 */
export async function schedulePickupForOrder(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AdminOrderError("Order not found.");
  if (!order.trackingNumber) {
    throw new AdminOrderError("Book a courier before scheduling a pickup.");
  }
  return pickupAndLabel(order);
}

/** Customer-side: request a return — only from 'delivered'. */
export async function requestReturn(
  orderId: string,
  /** A signed-in account, or a guest's order-link token (server/orders/guest-access.ts). */
  owner: { id: string; pwf?: string } | { guestToken: string },
  reason: string,
) {
  const scope =
    "guestToken" in owner
      ? { confirmationToken: owner.guestToken }
      : await accountOrderScope(owner);

  // The return window. The order page already hides the button once it has
  // passed; this is the check that counts, for a page left open past the
  // deadline or a request made without the page at all.
  const [order, settings] = await Promise.all([
    prisma.order.findFirst({ where: { id: orderId, ...scope }, select: { deliveredAt: true } }),
    getStoreSettings(),
  ]);
  if (order && !isReturnWindowOpen(order.deliveredAt, settings.returnRequestHours)) {
    const deadline = returnDeadline(order.deliveredAt, settings.returnRequestHours)!;
    throw new AdminOrderError(
      `Returns can be requested within ${windowLength(settings.returnRequestHours)} of delivery — that closed on ${formatDeadline(deadline)}. Please contact us if something is wrong with your order.`
    );
  }

  const claim = await prisma.order.updateMany({
    // Scoped like every customer-side order action — see accountOrderScope.
    where: { id: orderId, ...scope, orderStatus: "delivered" },
    data: {
      orderStatus: "return_requested",
      returnReason: reason,
      returnRequestedAt: new Date(),
      // Cleared so processReturn can claim this request: a previous return on
      // the same order (declined, then asked again) left it set. See there.
      returnResolvedAt: null,
    },
  });
  if (claim.count === 0) {
    throw new AdminOrderError("Only delivered orders can be returned.");
  }
}

/**
 * Admin return review. Reject → back to delivered. Approve → restore stock;
 * optionally refund via Razorpay (paid orders only), marking the order
 * refunded; otherwise mark returned.
 *
 * ⚠️  Exactly once, by an atomic claim. This used to read the order, check
 * it was return_requested, and then act — so two people deciding the same
 * return at once (two tabs, owner and staff) both passed the check, and the
 * stock went back twice, the refund was attempted twice, and the customer got
 * two decision emails. Now the first decision stamps returnResolvedAt where
 * it is still null; anyone else matches no row and is told it's been done.
 *
 * And the refund goes FIRST. A refund Razorpay refuses must leave nothing
 * changed, so the claim is released and the owner can simply try again —
 * before, stock had already been put back, and a retry put it back again.
 */
export async function processReturn(
  orderId: string,
  action: "approve" | "reject",
  refund: boolean
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) throw new AdminOrderError("Order not found.");
  if (order.orderStatus !== "return_requested") {
    throw new AdminOrderError("No pending return request on this order.");
  }

  // A stamp OLDER than the current request is left over from a previous return
  // on this order, requested again before requestReturn began clearing it.
  // Clear exactly that stale value, so it can't lock this request out.
  if (
    order.returnResolvedAt &&
    order.returnRequestedAt &&
    order.returnResolvedAt < order.returnRequestedAt
  ) {
    await prisma.order.updateMany({
      where: { id: orderId, returnResolvedAt: order.returnResolvedAt },
      data: { returnResolvedAt: null },
    });
  }

  const claim = await prisma.order.updateMany({
    where: { id: orderId, orderStatus: "return_requested", returnResolvedAt: null },
    data: { returnResolvedAt: new Date() },
  });
  if (claim.count === 0) {
    throw new AdminOrderError("This return has already been dealt with — refresh to see the outcome.");
  }

  if (action === "reject") {
    await prisma.order.update({
      where: { id: orderId },
      data: { orderStatus: "delivered" },
    });
    return { refunded: false };
  }

  const refunding = refund && order.paymentStatus === "paid" && !!order.razorpayPaymentId;
  if (refunding) {
    try {
      await createRefund(order.razorpayPaymentId!, toPaise(order.totalAmount));
    } catch (err) {
      // Nothing has changed yet — give the claim back so it can be retried.
      await prisma.order.updateMany({
        where: { id: orderId, orderStatus: "return_requested" },
        data: { returnResolvedAt: null },
      });
      throw err;
    }
    // Recorded the moment Razorpay accepts it, apart from the stock below:
    // money that has gone out must be on the order even if what follows fails.
    await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: "refunded",
        refundStatus: "completed",
        refundAmount: order.totalAmount,
        refundProcessedAt: new Date(),
      },
    });
  }

  // Stock back and the final status together, so neither lands without the other.
  await prisma.$transaction(async (tx) => {
    await restoreStock(
      tx,
      order.items
        .filter((i) => i.productId !== null)
        .map((i) => ({ productId: i.productId!, quantity: i.quantity, size: i.size }))
    );
    await tx.order.update({
      where: { id: orderId },
      data: { orderStatus: refunding ? "refunded" : "returned" },
    });
  });
  return { refunded: refunding };
}

/** Everything an admin needs to pack, ship and support one order. */
export async function getAdminOrder(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      // Line items keep name/price/image snapshots, so a since-deleted product
      // still shows what was actually bought. sku/size live on the product.
      items: {
        include: { product: { select: { sku: true, slug: true, sizes: true } } },
      },
      user: { select: { id: true, name: true, email: true, phone: true, createdAt: true } },
    },
  });
}

/** Sortable columns, as an allowlist — see the note in products/admin.ts. */
const ORDER_SORTS = {
  order: (dir: SortDir) => ({ orderNumber: dir }),
  customer: (dir: SortDir) => ({ user: { name: dir } }),
  total: (dir: SortDir) => ({ totalAmount: dir }),
  payment: (dir: SortDir) => ({ paymentStatus: dir }),
  status: (dir: SortDir) => ({ orderStatus: dir }),
  placed: (dir: SortDir) => ({ createdAt: dir }),
} as const;

export type OrderSortKey = keyof typeof ORDER_SORTS;
export const ORDER_SORT_KEYS = Object.keys(ORDER_SORTS) as OrderSortKey[];
export function isOrderSortKey(value: unknown): value is OrderSortKey {
  return typeof value === "string" && (ORDER_SORT_KEYS as string[]).includes(value);
}

/**
 * The two enum filters, validated rather than trusted.
 *
 * ⚠️  These are query-string values. The admin page casts them
 * (`params.status as OrderStatus`), which satisfies the compiler and does
 * nothing at runtime — so `/admin/orders?status=zzzz` reached Prisma as an enum
 * value, threw PrismaClientValidationError and took the page down with a 500.
 * Anyone editing the URL could do it.
 *
 * Guarded here rather than at the page because this function already guards
 * `sort` the same way, and every caller then gets it for free. An unknown value
 * is dropped, so a mangled URL shows the unfiltered list instead of an error.
 */
const ORDER_STATUSES = [
  "placed",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "return_requested",
  "returned",
  "refunded",
] as const;

const PAYMENT_STATUSES = ["pending", "paying", "paid", "failed", "refunded"] as const;

function asOrderStatus(value: unknown): OrderStatus | undefined {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value)
    ? (value as OrderStatus)
    : undefined;
}

function asPaymentStatus(value: unknown): PaymentStatus | undefined {
  return typeof value === "string" && (PAYMENT_STATUSES as readonly string[]).includes(value)
    ? (value as PaymentStatus)
    : undefined;
}

/**
 * Phone clauses for the admin order search, only when the query looks like a
 * phone number. Stored numbers are bare 10 digits (phoneSchema), so "+91 98765
 * 43210" is reduced to its last ten digits first; a partial number (5+ digits)
 * still matches, since an admin may be reading one off a call log.
 */
function phoneSearch(q: string) {
  if (!/^[\d\s+\-()]+$/.test(q.trim())) return [];
  const digits = q.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
  if (digits.length < 5) return [];
  return [
    { shippingAddress: { path: ["phone"], string_contains: digits } },
    { user: { phone: { contains: digits } } },
  ];
}

/** See UNPAID_ATTEMPTS_FILTER in lib/order-coming-back.ts. */
const UNPAID_ATTEMPT = {
  paymentMethod: "razorpay" as const,
  paymentStatus: { in: ["pending" as const, "failed" as const] },
  razorpayPaymentId: null,
};

export async function getAdminOrders(params: {
  /** An OrderStatus, or "coming_back" — see lib/order-coming-back.ts. */
  status?: string;
  payment?: PaymentStatus;
  q?: string;
  page?: number;
  sort?: string;
  dir?: string;
}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = 20;

  const status = asOrderStatus(params.status);
  const comingBack = params.status === COMING_BACK_FILTER;
  const unpaidAttempts = params.status === UNPAID_ATTEMPTS_FILTER;
  const payment = asPaymentStatus(params.payment);

  // Hidden only from the plain list. Any filter or search shows everything it
  // matches — searching an order number must find it, unpaid or not.
  const hideUnpaid = !params.status && !params.payment && !params.q;

  const where = {
    ...(status ? { orderStatus: status } : {}),
    // Parcels the courier is bringing back, whatever their status label says.
    ...(comingBack ? { comingBackAt: { not: null }, receivedBackAt: null } : {}),
    ...(unpaidAttempts ? UNPAID_ATTEMPT : {}),
    ...(hideUnpaid ? { NOT: UNPAID_ATTEMPT } : {}),
    ...(payment ? { paymentStatus: payment } : {}),
    // Matches the order number, the customer's name/email, or the mobile the
    // order shipped to — what an admin has to hand when someone gets in touch.
    // Mobile matters most for guests: one who mistyped their email at checkout
    // never got the confirmation, and their phone is all they can give us.
    ...(params.q
      ? {
          OR: [
            { orderNumber: { contains: params.q, mode: "insensitive" as const } },
            { user: { name: { contains: params.q, mode: "insensitive" as const } } },
            { user: { email: { contains: params.q, mode: "insensitive" as const } } },
            ...phoneSearch(params.q),
          ],
        }
      : {}),
  };

  // Newest first by default: an order list is a work queue.
  const sortKey: OrderSortKey = isOrderSortKey(params.sort) ? params.sort : "placed";
  const dir: SortDir = params.dir === "asc" ? "asc" : "desc";

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { items: true, user: { select: { name: true, email: true } } },
      orderBy: ORDER_SORTS[sortKey](dir),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where }),
  ]);
  // How many the plain list is leaving out, for the "show them" line.
  const hiddenUnpaid = hideUnpaid ? await prisma.order.count({ where: UNPAID_ATTEMPT }) : 0;
  return { orders, total, page, pageSize, hiddenUnpaid };
}
