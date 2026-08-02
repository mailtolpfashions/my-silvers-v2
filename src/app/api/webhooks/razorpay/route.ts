import { verifyWebhookSignature } from "@/server/payments/verify-signature";
import { fulfillOrder, markPaymentFailed, PaymentError } from "@/server/orders/fulfill-order";
import { checkRateLimit, getClientIp } from "@/server/rate-limit/limiter";

/**
 * Razorpay webhook — the second of the two verification paths racing into
 * fulfillOrder() (the client verify action is the other). MUST read the raw
 * body with req.text() before any JSON parsing: the HMAC is computed over the
 * exact bytes Razorpay sent, and re-serialized JSON would never match.
 */
export async function POST(req: Request) {
  if (!(await checkRateLimit("webhook", await getClientIp()))) {
    return new Response("Too many requests", { status: 429 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (!signature || !verifyWebhookSignature(rawBody, signature)) {
    return new Response("Invalid signature", { status: 400 });
  }

  let event: {
    event?: string;
    payload?: { payment?: { entity?: { id?: string; order_id?: string } } };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Malformed body", { status: 400 });
  }

  const payment = event.payload?.payment?.entity;

  try {
    switch (event.event) {
      case "payment.captured":
      case "payment.authorized":
        if (payment?.order_id && payment.id) {
          await fulfillOrder({
            razorpayOrderId: payment.order_id,
            razorpayPaymentId: payment.id,
            source: "webhook",
          });
        }
        break;
      case "payment.failed":
        if (payment?.order_id) {
          await markPaymentFailed(payment.order_id);
        }
        break;
      // Unknown events are acknowledged without action.
    }
  } catch (err) {
    if (err instanceof PaymentError) {
      // Permanent outcomes (bad amount, sold-out stock already marked failed,
      // unknown order) — retrying the webhook would never succeed, so ack it.
      console.error("webhook fulfillment rejected", err.code, err.message);
      return Response.json({ ok: true, note: err.code });
    }
    // Transient failure (DB down, Razorpay API hiccup) — 500 makes Razorpay
    // retry with backoff, which is exactly what we want.
    console.error("webhook processing failed", err);
    return new Response("Internal error", { status: 500 });
  }

  return Response.json({ ok: true });
}
