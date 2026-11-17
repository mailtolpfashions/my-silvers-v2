import crypto from "node:crypto";
import { prisma } from "@/server/db";
import { checkIpRateLimit } from "@/server/rate-limit/limiter";
import { normaliseScans } from "@/server/integrations/shiprocket";
import { applyCourierUpdate } from "@/server/couriers/apply-update";
import { shiprocketWebhookTokens, noteWebhookReceived } from "@/server/settings/courier-config";
import type { OrderStatus } from "@/generated/prisma/client";

/**
 * Shiprocket tracking webhook.
 *
 * Without this the tracking number is written once, when the waybill is bought,
 * and never changes again — so a customer watching their order sees "shipped"
 * from dispatch until the day it arrives, and "delivered" never happens at all.
 * Shiprocket pushes every scan; this turns the ones that matter into our own
 * order status.
 *
 * ── Auth ─────────────────────────────────────────────────────────────────────
 * Shiprocket does not sign its payloads. What it offers is a shared token you
 * set in the dashboard alongside the URL, sent back as `x-api-key`. That is
 * weaker than Razorpay's HMAC — it proves the caller knows a secret but not
 * that the body is untampered — so this route treats the body as untrusted
 * regardless: it only ever matches a known AWB or order number and only ever
 * moves status forward through a fixed table. A forged payload cannot invent an
 * order, change an amount, or move anything backwards.
 *
 * Configure at: Settings → API → Webhooks, with the URL and token shown on the
 * Courier page. ⚠️ Shiprocket refuses webhook URLs containing "shiprocket",
 * "kartrocket", "sr" or "kr" — so the URL to register is the alias
 * /api/webhooks/courier-updates (which runs this handler). This path stays for
 * anything already pointed at it.
 */

/**
 * Shiprocket's status vocabulary is large, inconsistently cased, and courier
 * dependent. Only the transitions that mean something to a shopper are mapped;
 * everything else (in transit, out for delivery, undelivered attempts) is a
 * scan we deliberately ignore, because it would either say nothing new or
 * promise something we cannot stand behind.
 */
const STATUS_MAP: Record<string, OrderStatus> = {
  delivered: "delivered",
  cancelled: "cancelled",
  canceled: "cancelled",
  "rto delivered": "returned",
  "rto initiated": "returned",
  "rto acknowledged": "returned",
  "return delivered": "returned",
  shipped: "shipped",
  "picked up": "shipped",
  "pickup complete": "shipped",
};

/**
 * The token made on the Courier page, or the older SHIPROCKET_WEBHOOK_TOKEN —
 * both accepted, so moving from one to the other never drops an update.
 */
async function tokenMatches(provided: string | null): Promise<boolean> {
  if (!provided) return false;
  const b = Buffer.from(provided);
  return (await shiprocketWebhookTokens()).some((expected) => {
    const a = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

export async function POST(req: Request) {
  // Its own tier, not Razorpay's — see the note on shiprocketWebhook.
  if (!(await checkIpRateLimit("shiprocketWebhook"))) {
    return new Response("Too many requests", { status: 429 });
  }

  if (!(await tokenMatches(req.headers.get("x-api-key")))) {
    return new Response("Invalid token", { status: 401 });
  }
  // For the Courier page's "Last update received".
  await noteWebhookReceived("shiprocket");

  let event: {
    awb?: string | number;
    order_id?: string;
    current_status?: string;
    shipment_status?: string;
    courier_name?: string;
    scans?: unknown;
  };
  try {
    event = await req.json();
  } catch {
    return new Response("Malformed body", { status: 400 });
  }

  const awb = event.awb ? String(event.awb) : null;
  const orderNumber = event.order_id ? String(event.order_id) : null;
  const raw = (event.current_status ?? event.shipment_status ?? "").trim().toLowerCase();
  const next = STATUS_MAP[raw];

  // AWB first — it is the identifier Shiprocket owns. order_id is our own
  // orderNumber echoed back, and is the fallback for scans that omit the AWB.
  const order = awb
    ? await prisma.order.findFirst({ where: { trackingNumber: awb } })
    : orderNumber
      ? await prisma.order.findUnique({ where: { orderNumber } })
      : null;

  if (!order) return new Response("Unknown shipment", { status: 200 });

  /**
   * The scan trail is stored for EVERY push, including the ones STATUS_MAP
   * ignores — and especially those. "In Transit" and "Out for Delivery" do not
   * move our order status, because there is no status for them and inventing
   * one would promise something we cannot stand behind; but they are exactly
   * what a customer wants to read on the tracking page.
   *
   * Forward-only moves, the scan merge and the Delivered email are shared
   * with the NimbusPost webhook — see server/couriers/apply-update.ts.
   */
  const moved = await applyCourierUpdate(order, {
    next,
    scans: normaliseScans(event.scans),
    courierName: event.courier_name ? String(event.courier_name) : null,
  });

  return new Response(moved ? "OK" : "Recorded", { status: 200 });
}
