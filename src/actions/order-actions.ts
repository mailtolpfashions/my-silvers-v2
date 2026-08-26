"use server";

import { z } from "zod";
import { auth } from "@/server/auth/auth";
import { createOrder, OrderError } from "@/server/orders/create-order";
import { fulfillOrder, PaymentError } from "@/server/orders/fulfill-order";
import { cancelOrder, CancelError } from "@/server/orders/cancel-order";
import { requestReturn, AdminOrderError } from "@/server/orders/admin";
import { revalidatePath, updateTag } from "next/cache";
import {
  checkIpRateLimit,
  checkRateLimit,
  getClientIp,
  RATE_LIMIT_MESSAGE,
} from "@/server/rate-limit/limiter";
import {
  INDIAN_STATES,
  PINCODE_STATE_MISMATCH,
  phoneSchema,
  pincodeMatchesState,
  pincodeSchema,
} from "@/lib/validation/account";
import { getStoreSettings } from "@/server/settings/store-settings";

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
  /**
   * ⚠️  These two were `z.string().min(2).max(100)` and `/^[0-9]{6}/`, which is
   * looser than the address book has always been — checkout accepted any
   * two-character string as a state, and a PIN code starting with 0, which
   * India Post never issues. The same address typed in two places on this site
   * was validated to two different standards, and the weaker one was on the
   * screen that takes the money.
   */
  state: z.enum(INDIAN_STATES, { message: "Select a state." }),
  pincode: pincodeSchema,
}).superRefine((value, ctx) => {
  /**
   * State and PIN code have to agree.
   *
   * Reported: selecting Punjab and entering a Chennai PIN code placed the order
   * successfully. Each field was valid alone, and nothing compared them — so
   * the shop found out when the courier did, days later and at its own cost.
   *
   * Zone-level check; see pincodeMatchesState for exactly what it does and does
   * not catch.
   */
  if (!pincodeMatchesState(value.pincode, value.state)) {
    ctx.addIssue({ code: "custom", path: ["pincode"], message: PINCODE_STATE_MISMATCH });
  }
});

const placeOrderSchema = z.object({
  address: addressSchema,
  // Both methods stay valid SHAPES here. Whether "cod" is actually offered is
  // a store setting, checked below — not a schema concern, because the enum
  // must also keep parsing for as long as COD orders exist in the database.
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

  /**
   * Guest checkout is deliberately tighter than authenticated, and is limited
   * on TWO keys rather than one.
   *
   * ⚠️  It was a single 3-per-30-minutes bucket keyed by IP, which is a way to
   * refuse real customers in India. Jio and Airtel put subscribers behind
   * CGNAT, so thousands of people share one public address — three guest
   * orders from anywhere behind it locked out everyone else for half an hour.
   * On a shop whose traffic is mostly mobile that is a normal afternoon, not
   * an edge case.
   *
   *   guestOrder    (email, tight)  the case worth stopping: one person
   *                                 ordering over and over
   *   guestOrderIp  (IP, loose)     the backstop: a script working through a
   *                                 list of addresses
   *
   * The IP half is SKIPPED when the address is unknown rather than falling back
   * to a shared constant, which put every unidentifiable visitor in one bucket.
   * See getClientIp.
   *
   * A guest order always carries an email — the schema marks it optional, but
   * the check below refuses without one — so the tight limit is never the half
   * that gets skipped.
   */
  let allowed: boolean;
  if (userId) {
    allowed = await checkRateLimit("order", userId);
  } else {
    const ip = await getClientIp();
    const email = data.guestEmail?.toLowerCase();
    allowed =
      (!email || (await checkRateLimit("guestOrder", email))) &&
      (!ip || (await checkRateLimit("guestOrderIp", ip)));
  }
  if (!allowed) return { ok: false, error: RATE_LIMIT_MESSAGE };

  // ── Store settings gate ──
  //
  // The checkout form already hides a disabled payment method, but hiding a
  // radio is presentation, not enforcement: this action is a public endpoint
  // and accepts whatever is posted to it. createOrder re-checks as well.
  const settings = await getStoreSettings();
  if (data.paymentMethod === "cod" && !settings.codEnabled) {
    return { ok: false, error: "Cash on delivery isn't available right now. Please pay online." };
  }
  if (!userId && !settings.guestCheckoutEnabled) {
    return { ok: false, error: "Please sign in to place your order." };
  }

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
    // Placing an order decrements stock, and every listing filters stock > 0 —
    // without this a sold-out piece lingers in cached grids. Cosmetic rather
    // than an oversell risk (decrementStock's conditional UPDATE is still
    // authoritative), but it looks broken.
    updateTag("products");
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
  if (!(await checkIpRateLimit("paymentVerify"))) {
    return { ok: false, error: RATE_LIMIT_MESSAGE };
  }

  const parsed = verifySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid payment response." };

  try {
    await fulfillOrder({ ...parsed.data, source: "client" });
    revalidatePath("/cart");
    updateTag("products");
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
