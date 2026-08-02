import crypto from "node:crypto";
import { prisma } from "@/server/db";
import { Prisma } from "@/generated/prisma/client";
import type { Order, PaymentMethod } from "@/generated/prisma/client";
import { decrementStock, InsufficientStockError } from "@/server/products/stock";
import { nextOrderNumber } from "@/server/orders/order-number";
import {
  toPaise,
  paiseToRupeeString,
  shippingChargePaise,
  MAX_ITEM_QUANTITY,
} from "@/server/orders/money";
import { createRazorpayOrder } from "@/server/payments/razorpay";
import { sendOrderConfirmationEmail } from "@/server/email/resend";

export class OrderError extends Error {
  constructor(
    public code:
      | "EMPTY_CART"
      | "PRODUCT_UNAVAILABLE"
      | "INSUFFICIENT_STOCK"
      | "GUEST_EMAIL_REQUIRED"
      | "PAYMENT_GATEWAY_ERROR",
    message: string
  ) {
    super(message);
    this.name = "OrderError";
  }
}

export type ShippingAddressInput = {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
};

type ResolvedItem = {
  productId: string;
  name: string;
  image: string | null;
  pricePaise: number;
  quantity: number;
  weight: string | null;
};

export type CreateOrderResult = {
  order: Order;
  alreadyExisted: boolean;
  razorpay?: { razorpayOrderId: string; amountPaise: number };
};

/**
 * Resolves raw {productId, quantity} pairs against live product rows.
 * Dedupes, clamps quantity to 1..MAX_ITEM_QUANTITY, rejects inactive
 * products, and snapshots name/image/price/weight at this instant. This is a
 * pre-check only — the binding stock enforcement is the conditional UPDATE in
 * decrementStock.
 */
async function resolveItems(
  rawItems: Array<{ productId: string; quantity: number }>
): Promise<ResolvedItem[]> {
  const merged = new Map<string, number>();
  for (const item of rawItems) {
    const qty = Math.max(1, Math.min(MAX_ITEM_QUANTITY, Math.trunc(item.quantity) || 1));
    merged.set(item.productId, Math.min(MAX_ITEM_QUANTITY, (merged.get(item.productId) ?? 0) + qty));
  }
  if (merged.size === 0) throw new OrderError("EMPTY_CART", "No items to order.");

  const products = await prisma.product.findMany({
    where: { id: { in: [...merged.keys()] }, isActive: true },
  });
  if (products.length !== merged.size) {
    throw new OrderError("PRODUCT_UNAVAILABLE", "One or more items are no longer available.");
  }

  return products.map((p) => {
    const quantity = merged.get(p.id)!;
    if (p.stock < quantity) {
      throw new OrderError("INSUFFICIENT_STOCK", `Only ${p.stock} left of "${p.name}".`);
    }
    return {
      productId: p.id,
      name: p.name,
      image: p.images[0] ?? null,
      pricePaise: toPaise(p.price),
      quantity,
      weight: p.weight?.toString() ?? null,
    };
  });
}

async function resolveGuestUser(guestEmail: string, address: ShippingAddressInput) {
  const email = guestEmail.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  return prisma.user.create({
    data: { email, name: address.fullName, phone: address.phone, role: "customer" },
  });
}

export async function createOrder(input: {
  userId?: string;
  guestEmail?: string;
  /** Guest checkout submits items directly; authed checkout reads the DB cart. */
  items?: Array<{ productId: string; quantity: number }>;
  shippingAddress: ShippingAddressInput;
  paymentMethod: PaymentMethod;
  notes?: string;
  idempotencyKey?: string;
}): Promise<CreateOrderResult> {
  // ── Resolve the purchasing user ──
  let userId = input.userId;
  let email: string;
  let isGuest = false;

  if (userId) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    email = user.email;
  } else {
    if (!input.guestEmail) throw new OrderError("GUEST_EMAIL_REQUIRED", "Email is required.");
    const guest = await resolveGuestUser(input.guestEmail, input.shippingAddress);
    userId = guest.id;
    email = guest.email;
    isGuest = true;
  }

  // ── Resolve items (authed → DB cart, guest → submitted payload) ──
  let rawItems = input.items;
  if (!rawItems) {
    const cart = await prisma.cart.findUnique({
      where: { userId },
      include: { items: true },
    });
    rawItems = cart?.items.map((i) => ({ productId: i.productId, quantity: i.quantity })) ?? [];
  }
  const items = await resolveItems(rawItems);

  // ── Totals in integer paise ──
  const subtotalPaise = items.reduce((sum, i) => sum + i.pricePaise * i.quantity, 0);
  const shippingPaise = shippingChargePaise(subtotalPaise);
  const totalPaise = subtotalPaise + shippingPaise;

  // ── Razorpay order first (external call — never inside the DB transaction).
  // If the DB write below fails, the gateway order is simply never paid. ──
  let razorpayOrderId: string | undefined;
  if (input.paymentMethod === "razorpay") {
    try {
      const rpOrder = await createRazorpayOrder(totalPaise);
      razorpayOrderId = rpOrder.id;
    } catch {
      throw new OrderError("PAYMENT_GATEWAY_ERROR", "Could not reach the payment gateway. Please try again.");
    }
  }

  const confirmationToken = isGuest ? crypto.randomBytes(24).toString("hex") : null;

  // ── Create the order. The unique (userId, idempotencyKey) constraint turns
  // client retries into a fetch of the already-created order. ──
  let order: Order;
  try {
    order = await prisma.$transaction(async (tx) => {
      const orderNumber = await nextOrderNumber(tx);

      // COD has no payment-confirmation step, so stock is decremented now.
      // Razorpay stock decrement is deferred to fulfillOrder().
      if (input.paymentMethod === "cod") {
        await decrementStock(tx, items);
      }

      const created = await tx.order.create({
        data: {
          orderNumber,
          userId: userId!,
          confirmationToken,
          idempotencyKey: input.idempotencyKey || null,
          shippingAddress: { ...input.shippingAddress },
          paymentMethod: input.paymentMethod,
          paymentStatus: "pending",
          orderStatus: "placed",
          razorpayOrderId,
          subtotal: paiseToRupeeString(subtotalPaise),
          shippingCharge: paiseToRupeeString(shippingPaise),
          totalAmount: paiseToRupeeString(totalPaise),
          notes: input.notes || null,
          items: {
            create: items.map((i) => ({
              productId: i.productId,
              name: i.name,
              image: i.image,
              price: paiseToRupeeString(i.pricePaise),
              quantity: i.quantity,
              weight: i.weight,
            })),
          },
        },
      });

      // COD orders are final immediately — clear the DB cart in the same tx.
      if (input.paymentMethod === "cod" && !input.items) {
        await tx.cartItem.deleteMany({ where: { cart: { userId: userId! } } });
      }

      return created;
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002" &&
      input.idempotencyKey
    ) {
      const existing = await prisma.order.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey: input.idempotencyKey } },
      });
      if (existing) {
        return {
          order: existing,
          alreadyExisted: true,
          razorpay:
            existing.paymentMethod === "razorpay" &&
            existing.paymentStatus === "pending" &&
            existing.razorpayOrderId
              ? {
                  razorpayOrderId: existing.razorpayOrderId,
                  amountPaise: toPaise(existing.totalAmount),
                }
              : undefined,
        };
      }
    }
    if (err instanceof InsufficientStockError) {
      throw new OrderError("INSUFFICIENT_STOCK", "An item sold out while you were checking out.");
    }
    throw err;
  }

  // ── Post-commit side effects (never block or fail the order) ──
  if (input.paymentMethod === "cod") {
    try {
      await sendOrderConfirmationEmail({
        to: email,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount.toString(),
      });
    } catch (err) {
      console.error("order-confirmation email failed", order.orderNumber, err);
    }
  }

  return {
    order,
    alreadyExisted: false,
    razorpay: razorpayOrderId
      ? { razorpayOrderId, amountPaise: totalPaise }
      : undefined,
  };
}
