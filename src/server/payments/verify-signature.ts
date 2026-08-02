import crypto from "node:crypto";

function timingSafeHexEqual(expectedHex: string, providedHex: string): boolean {
  const expected = Buffer.from(expectedHex, "hex");
  let provided: Buffer;
  try {
    provided = Buffer.from(providedHex, "hex");
  } catch {
    return false;
  }
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(expected, provided);
}

/**
 * Client-checkout signature scheme: Razorpay's Checkout.js handler returns
 * razorpay_signature = HMAC-SHA256(`${orderId}|${paymentId}`, KEY_SECRET).
 */
export function verifyCheckoutSignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): boolean {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
    .digest("hex");
  return timingSafeHexEqual(expected, params.razorpaySignature);
}

/**
 * Webhook signature scheme: HMAC-SHA256 over the RAW request body string
 * (never re-serialized JSON) with the separate WEBHOOK_SECRET, compared to
 * the `x-razorpay-signature` header.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest("hex");
  return timingSafeHexEqual(expected, signatureHeader);
}
