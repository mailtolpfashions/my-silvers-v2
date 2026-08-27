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
  giftWrapChargePaise,
  MAX_ITEM_QUANTITY,
} from "@/server/orders/money";
import { createRazorpayOrder } from "@/server/payments/razorpay";
import { getStoreSettings } from "@/server/settings/store-settings";
import { sendOrderConfirmationEmail } from "@/server/email/resend";

export class OrderError extends Error {
  constructor(
    public code:
      | "EMPTY_CART"
      | "PRODUCT_UNAVAILABLE"
      | "INSUFFICIENT_STOCK"
      | "GUEST_EMAIL_REQUIRED"
      | "PAYMENT_GATEWAY_ERROR"
      | "PAYMENT_METHOD_UNAVAILABLE"
      | "GUEST_CHECKOUT_DISABLED",
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
  /**
   * What the piece cost US, snapshotted at the moment of sale.
   *
   * ⚠️  Every margin figure in /admin/finance reads THIS, not the live
   * Product.costPrice. Reading it live would mean re-pricing stock next year
   * silently rewrites last year's profit — the same reason `price` above is
   * a snapshot. Null for pieces sold before costs were recorded; those lines
   * are excluded from margin rather than counted as free.
   */
  costPricePaise: number | null;
  /** Snapshotted onto the OrderItem — this is what fulfilment picks. */
  size: string;
};

export type CreateOrderResult = {
  order: Order;
  alreadyExisted: boolean;
  razorpay?: { razorpayOrderId: string; amountPaise: number };
};

/**
 * Resolves raw {productId, size, quantity} triples against live product rows.
 *
 * Dedupes, clamps quantity to 1..MAX_ITEM_QUANTITY, rejects inactive products,
 * and snapshots name/image/price/weight/size at this instant. This is a
 * pre-check only — the binding stock enforcement is the conditional UPDATE in
 * decrementStock.
 *
 * Lines are keyed by product AND size. Merging on product alone would collapse
 * "ring size 7" and "ring size 9" into one line and silently discard one of the
 * sizes, which is unrecoverable once the cart is cleared.
 *
 * Availability is checked against the ProductVariant row for a sized line, and
 * against Product.stock for an unsized one. Checking only the product total
 * would sell the last size 6 while the remaining units were all size 9.
 */
async function resolveItems(
  rawItems: Array<{ productId: string; quantity: number; size?: string }>
): Promise<ResolvedItem[]> {
  const merged = new Map<string, { productId: string; size: string; quantity: number }>();
  for (const item of rawItems) {
    const qty = Math.max(1, Math.min(MAX_ITEM_QUANTITY, Math.trunc(item.quantity) || 1));
    const size = item.size ?? "";
    const key = `${item.productId}::${size}`;
    const prev = merged.get(key);
    merged.set(key, {
      productId: item.productId,
      size,
      quantity: Math.min(MAX_ITEM_QUANTITY, (prev?.quantity ?? 0) + qty),
    });
  }
  if (merged.size === 0) throw new OrderError("EMPTY_CART", "No items to order.");

  const lines = [...merged.values()];
  const productIds = [...new Set(lines.map((l) => l.productId))];

  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, isActive: true },
    include: { variants: true },
  });
  if (products.length !== productIds.length) {
    throw new OrderError("PRODUCT_UNAVAILABLE", "One or more items are no longer available.");
  }
  const byId = new Map(products.map((p) => [p.id, p]));

  // Unsized lines still share the product pool, so they are summed before
  // comparing; sized lines each check their own variant below.
  const unsizedPerProduct = new Map<string, number>();
  for (const line of lines) {
    if (line.size) continue;
    unsizedPerProduct.set(
      line.productId,
      (unsizedPerProduct.get(line.productId) ?? 0) + line.quantity,
    );
  }
  for (const [productId, wanted] of unsizedPerProduct) {
    const product = byId.get(productId)!;
    if (product.stock < wanted) {
      throw new OrderError("INSUFFICIENT_STOCK", `Only ${product.stock} left of "${product.name}".`);
    }
  }

  return lines.map((line) => {
    const p = byId.get(line.productId)!;
    // A size that is no longer offered would send an unfulfillable line to the
    // packer, so it is rejected rather than quietly dropped.
    if (p.sizes.length > 0 && !p.sizes.includes(line.size)) {
      throw new OrderError("PRODUCT_UNAVAILABLE", `"${p.name}" is no longer available in that size.`);
    }

    if (line.size) {
      const variant = p.variants.find((v) => v.size === line.size);
      // A pre-check only — decrementStock's conditional UPDATE is what actually
      // binds. This exists so the shopper gets a clear message naming the size
      // rather than a generic failure at the end of checkout.
      if (!variant || variant.stock < line.quantity) {
        throw new OrderError(
          "INSUFFICIENT_STOCK",
          `Only ${variant?.stock ?? 0} left of "${p.name}" in size ${line.size}.`,
        );
      }
    }

    return {
      productId: p.id,
      name: p.name,
      image: p.images[0] ?? null,
      pricePaise: toPaise(p.price),
      quantity: line.quantity,
      weight: p.weight?.toString() ?? null,
      costPricePaise: p.costPrice === null ? null : toPaise(p.costPrice),
      size: p.sizes.length > 0 ? line.size : "",
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
  items?: Array<{ productId: string; quantity: number; size?: string }>;
  shippingAddress: ShippingAddressInput;
  paymentMethod: PaymentMethod;
  notes?: string;
  isGift?: boolean;
  giftMessage?: string;
  idempotencyKey?: string;
}): Promise<CreateOrderResult> {
  // ── Store settings gate ──
  //
  // Re-checked here even though placeOrderAction already rejected a disabled
  // method, because this function is the only thing that actually creates an
  // order and it is reachable from more than one caller. A switch enforced only
  // in the action is a switch that the next entry point forgets.
  const settings = await getStoreSettings();
  if (input.paymentMethod === "cod" && !settings.codEnabled) {
    throw new OrderError(
      "PAYMENT_METHOD_UNAVAILABLE",
      "Cash on delivery isn't available right now. Please pay online."
    );
  }
  if (!input.userId && !settings.guestCheckoutEnabled) {
    throw new OrderError(
      "GUEST_CHECKOUT_DISABLED",
      "Please sign in to place your order."
    );
  }

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
    rawItems =
      cart?.items.map((i) => ({ productId: i.productId, quantity: i.quantity, size: i.size })) ?? [];
  }
  const items = await resolveItems(rawItems);

  // ── Totals in integer paise ──
  const subtotalPaise = items.reduce((sum, i) => sum + i.pricePaise * i.quantity, 0);
  // Charged from the settings read above, not from whatever the client showed.
  const shippingPaise = shippingChargePaise(subtotalPaise, settings);
  /**
   * Recomputed here from the settings, never taken from the request.
   *
   * The browser posts only WHETHER wrapping was asked for; what it costs is
   * decided at this moment, by the shop. Same rule as the shipping charge and
   * the line prices — see the note at the top of this function.
   */
  const giftWrapPaise = giftWrapChargePaise(input.isGift === true, settings);
  const totalPaise = subtotalPaise + shippingPaise + giftWrapPaise;

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
          giftWrapCharge: paiseToRupeeString(giftWrapPaise),
          totalAmount: paiseToRupeeString(totalPaise),
          notes: input.notes || null,
          isGift: input.isGift === true,
          // Never stored against a non-gift order, so a packing screen can
          // trust the flag alone and not have to check both.
          giftMessage: (input.isGift && input.giftMessage) || null,
          items: {
            create: items.map((i) => ({
              productId: i.productId,
              name: i.name,
              image: i.image,
              price: paiseToRupeeString(i.pricePaise),
              quantity: i.quantity,
              weight: i.weight,
              costPrice:
                i.costPricePaise === null ? null : paiseToRupeeString(i.costPricePaise),
              size: i.size,
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
