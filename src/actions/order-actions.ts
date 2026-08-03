"use server";

import { z } from "zod";
import { auth } from "@/server/auth/auth";
import { createOrder, OrderError } from "@/server/orders/create-order";
import { fulfillOrder, PaymentError } from "@/server/orders/fulfill-order";
import { cancelOrder, CancelError } from "@/server/orders/cancel-order";
import { requestReturn, AdminOrderError } from "@/server/orders/admin";
import { revalidatePath } from "next/cache";
import {
  checkRateLimit,
  getClientIp,
  RATE_LIMIT_MESSAGE,
} from "@/server/rate-limit/limiter";
import { phoneSchema } from "@/lib/validation/account";

const addressSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  // Shared with the address book so orders and saved addresses store the same
  // normalised 10-digit form. The previous regex allowed "+91 98765 43210",
  // which Razorpay's prefill.contact silently rejects — the customer was then
  // asked for a number they had already typed.
  phone: phoneSchema,
  addressLine1: z.string().trim().min(3).max(200),
  addressLine2: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  pincode: z.string().trim().regex(/^[0-9]{6}$/, "Pincode must be 6 digits"),
});

const placeOrderSchema = z.object({
  address: addressSchema,
  paymentMethod: z.enum(["razorpay", "cod"]),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  idempotencyKey: z.string().uuid(),
  guestEmail: z.string().trim().email().optional(),
  guestItems: z
    .array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(10) }))
    .max(50)
    .optional(),
});

export type PlaceOrderResult =
  | { ok: false; error: string }
  | {
      ok: true;
      orderId: string;
      orderNumber: string;
      confirmationToken: string | null;
      razorpay: { razorpayOrderId: string; amountPaise: number; keyId: string } | null;
    };

export async function placeOrderAction(input: unknown): Promise<PlaceOrderResult> {
  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid checkout details." };
  }
  const data = parsed.data;

  const session = await auth();
  const userId = session?.user?.id;

  // Guest checkout is deliberately tighter than authenticated (3/30m vs 10/15m).
  const allowed = userId
    ? await checkRateLimit("order", userId)
    : await checkRateLimit("guestOrder", await getClientIp());
  if (!allowed) return { ok: false, error: RATE_LIMIT_MESSAGE };

  if (!userId && !data.guestEmail) {
    return { ok: false, error: "Email is required for guest checkout." };
  }
  if (!userId && (!data.guestItems || data.guestItems.length === 0)) {
    return { ok: false, error: "Your cart is empty." };
  }

  try {
    const result = await createOrder({
      userId: userId ?? undefined,
      guestEmail: userId ? undefined : data.guestEmail,
      items: userId ? undefined : data.guestItems,
      shippingAddress: {
        ...data.address,
        addressLine2: data.address.addressLine2 || undefined,
      },
      paymentMethod: data.paymentMethod,
      notes: data.notes || undefined,
      idempotencyKey: data.idempotencyKey,
    });

    revalidatePath("/cart");
    return {
      ok: true,
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
      confirmationToken: result.order.confirmationToken,
      razorpay: result.razorpay
        ? { ...result.razorpay, keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID! }
        : null,
    };
  } catch (err) {
    if (err instanceof OrderError) return { ok: false, error: err.message };
    console.error("placeOrderAction failed", err);
    return { ok: false, error: "Could not place the order. Please try again." };
  }
}

const verifySchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export type VerifyPaymentResult = { ok: true } | { ok: false; error: string };

/**
 * Client-side half of the dual verification paths. Signature + amount checks
 * and the atomic claim all live in fulfillOrder — shared with the webhook.
 * No user scoping needed beyond the signature: it's computed with our secret
 * over this exact order/payment pair.
 */
export async function verifyPaymentAction(input: unknown): Promise<VerifyPaymentResult> {
  if (!(await checkRateLimit("paymentVerify", await getClientIp()))) {
    return { ok: false, error: RATE_LIMIT_MESSAGE };
  }

  const parsed = verifySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid payment response." };

  try {
    await fulfillOrder({ ...parsed.data, source: "client" });
    revalidatePath("/cart");
    return { ok: true };
  } catch (err) {
    if (err instanceof PaymentError) return { ok: false, error: err.message };
    console.error("verifyPaymentAction failed", err);
    return { ok: false, error: "Payment verification failed. If you were charged, it will be refunded." };
  }
}

export async function requestReturnAction(orderId: string, reason: string) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "Please sign in." };
  if (!(await checkRateLimit("orderOps", session.user.id))) {
    return { ok: false as const, error: RATE_LIMIT_MESSAGE };
  }

  const trimmed = reason.trim();
  if (trimmed.length < 5) {
    return { ok: false as const, error: "Please tell us briefly why you want to return this order." };
  }

  try {
    await requestReturn(orderId, session.user.id, trimmed.slice(0, 500));
    revalidatePath(`/account/orders/${orderId}`);
    return { ok: true as const };
  } catch (err) {
    if (err instanceof AdminOrderError) return { ok: false as const, error: err.message };
    console.error("requestReturnAction failed", err);
    return { ok: false as const, error: "Could not submit the return request." };
  }
}

export async function cancelOrderAction(orderId: string) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "Please sign in." };
  if (!(await checkRateLimit("orderOps", session.user.id))) {
    return { ok: false as const, error: RATE_LIMIT_MESSAGE };
  }

  try {
    const result = await cancelOrder({ orderId, userId: session.user.id });
    revalidatePath("/account/orders");
    revalidatePath(`/account/orders/${orderId}`);
    return { ok: true as const, refunded: result.refunded };
  } catch (err) {
    if (err instanceof CancelError) return { ok: false as const, error: err.message };
    console.error("cancelOrderAction failed", err);
    return { ok: false as const, error: "Could not cancel the order." };
  }
}
