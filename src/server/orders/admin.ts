import { prisma } from "@/server/db";
import type { OrderStatus } from "@/generated/prisma/client";
import { restoreStock } from "@/server/products/stock";
import type { SortDir } from "@/server/products/admin";
import type { PaymentStatus } from "@/generated/prisma/client";
import { toPaise } from "@/server/orders/money";
import { createRefund } from "@/server/payments/razorpay";
import { createShiprocketShipment } from "@/server/integrations/shiprocket";

export class AdminOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminOrderError";
  }
}

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  await prisma.order.update({ where: { id: orderId }, data: { orderStatus: status } });
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
 * Admin-triggered shipment creation — runs the two Shiprocket calls inline.
 * The shipmentCreatedAt-null claim makes double-clicks and concurrent admins
 * safe; a Shiprocket failure leaves the order in 'processing' with the claim
 * fields still null, so the admin can simply retry.
 */
export async function createShipmentForOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, user: true },
  });
  if (!order) throw new AdminOrderError("Order not found.");
  if (order.shiprocketOrderId || order.shipmentCreatedAt) {
    throw new AdminOrderError("A shipment already exists for this order.");
  }
  if (order.paymentMethod === "razorpay" && order.paymentStatus !== "paid") {
    throw new AdminOrderError("Cannot ship an unpaid online order.");
  }
  const claim = await prisma.order.updateMany({
    where: {
      id: orderId,
      shipmentCreatedAt: null,
      shiprocketOrderId: null,
      orderStatus: { in: ["placed", "confirmed", "processing"] },
    },
    data: { orderStatus: "processing" },
  });
  if (claim.count === 0) {
    throw new AdminOrderError("Order is not in a shippable state.");
  }

  const address = (order.shippingAddress ?? {}) as ShippingAddress;
  // Product weights are stored in grams; Shiprocket wants kilograms with a
  // 0.5kg floor (courier minimum).
  const weightGrams = order.items.reduce(
    (sum, i) => sum + Number(i.weight ?? 0) * i.quantity,
    0
  );
  const weightKg = Math.max(0.5, weightGrams / 1000);

  const result = await createShiprocketShipment({
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
    weightKg,
  });

  await prisma.order.update({
    where: { id: orderId },
    data: {
      shiprocketOrderId: result.shiprocketOrderId,
      shiprocketShipmentId: result.shiprocketShipmentId,
      trackingNumber: result.awbCode,
      trackingUrl: result.trackingUrl,
      courierName: result.courierName,
      shipmentCreatedAt: new Date(),
      orderStatus: "shipped",
    },
  });

  return result;
}

/** Customer-side: request a return — only from 'delivered'. */
export async function requestReturn(orderId: string, userId: string, reason: string) {
  const claim = await prisma.order.updateMany({
    where: { id: orderId, userId, orderStatus: "delivered" },
    data: {
      orderStatus: "return_requested",
      returnReason: reason,
      returnRequestedAt: new Date(),
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

  if (action === "reject") {
    await prisma.order.update({
      where: { id: orderId },
      data: { orderStatus: "delivered", returnResolvedAt: new Date() },
    });
    return { refunded: false };
  }

  await prisma.$transaction(async (tx) => {
    await restoreStock(
      tx,
      order.items
        .filter((i) => i.productId !== null)
        .map((i) => ({ productId: i.productId!, quantity: i.quantity, size: i.size }))
    );
  });

  if (refund && order.paymentStatus === "paid" && order.razorpayPaymentId) {
    await createRefund(order.razorpayPaymentId, toPaise(order.totalAmount));
    await prisma.order.update({
      where: { id: orderId },
      data: {
        orderStatus: "refunded",
        paymentStatus: "refunded",
        refundStatus: "completed",
        refundAmount: order.totalAmount,
        refundProcessedAt: new Date(),
        returnResolvedAt: new Date(),
      },
    });
    return { refunded: true };
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { orderStatus: "returned", returnResolvedAt: new Date() },
  });
  return { refunded: false };
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

export async function getAdminOrders(params: {
  status?: OrderStatus;
  payment?: PaymentStatus;
  q?: string;
  page?: number;
  sort?: string;
  dir?: string;
}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = 20;

  const where = {
    ...(params.status ? { orderStatus: params.status } : {}),
    ...(params.payment ? { paymentStatus: params.payment } : {}),
    // Matches the order number or the customer's name/email — the three things
    // an admin has to hand when someone gets in touch about an order.
    ...(params.q
      ? {
          OR: [
            { orderNumber: { contains: params.q, mode: "insensitive" as const } },
            { user: { name: { contains: params.q, mode: "insensitive" as const } } },
            { user: { email: { contains: params.q, mode: "insensitive" as const } } },
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
  return { orders, total, page, pageSize };
}
