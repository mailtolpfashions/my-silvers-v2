import crypto from "node:crypto";
import { prisma } from "@/server/db";
import { checkIpRateLimit } from "@/server/rate-limit/limiter";
import { normaliseScans, type ScanEvent } from "@/server/integrations/shiprocket";
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
 * Configure at: Settings → API → Webhooks, with SHIPROCKET_WEBHOOK_TOKEN.
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
 * How far along each status is. A webhook can arrive late, out of order, or
 * twice — Shiprocket makes no ordering guarantee — so a scan is only applied if
 * it moves the order FORWARD. Without this a delayed "shipped" scan landing
 * after "delivered" would un-deliver a completed order.
 *
 * cancelled and returned are terminal and sit above delivered: they are real
 * outcomes that can legitimately follow it (an RTO), and nothing should move an
 * order out of them.
 */
const RANK: Record<string, number> = {
  placed: 0,
  confirmed: 1,
  processing: 2,
  shipped: 3,
  delivered: 4,
  return_requested: 5,
  returned: 6,
  cancelled: 6,
  refunded: 7,
};

function tokenMatches(provided: string | null): boolean {
  const expected = process.env.SHIPROCKET_WEBHOOK_TOKEN;
  if (!expected || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  // Its own tier, not Razorpay's — see the note on shiprocketWebhook.
  if (!(await checkIpRateLimit("shiprocketWebhook"))) {
    return new Response("Too many requests", { status: 429 });
  }

  if (!tokenMatches(req.headers.get("x-api-key"))) {
    return new Response("Invalid token", { status: 401 });
  }

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
   * what a customer wants to read on the tracking page. Dropping them was the
   * behaviour before the timeline existed.
   */
  const scans = normaliseScans(event.scans);

  // Only ever grows. A push carrying two scans must not replace a trail of ten
  // — Shiprocket sends the recent window, not the full history.
  const merged = mergeScans(order.shipmentScans, scans);

  const advances = Boolean(next) && (RANK[next!] ?? 0) > (RANK[order.orderStatus] ?? 0);

  await prisma.order.update({
    where: { id: order.id },
    data: {
      ...(advances ? { orderStatus: next } : {}),
      ...(merged ? { shipmentScans: merged } : {}),
      // Couriers get reassigned more often than you would think, and the name
      // shown on the customer's tracking page should follow.
      ...(event.courier_name ? { courierName: String(event.courier_name) } : {}),
    },
  });

  return new Response(advances ? "OK" : "Recorded", { status: 200 });
}

/**
 * Union of what we hold and what just arrived, keyed on timestamp + activity.
 *
 * Returns null when nothing changed, so an unchanged trail is not rewritten on
 * every scan. Couriers repeat events across pushes, so de-duplication is the
 * normal path rather than an edge case.
 */
function mergeScans(existing: unknown, incoming: ScanEvent[]): ScanEvent[] | null {
  if (incoming.length === 0) return null;

  const held = normaliseScans(existing);
  const seen = new Set(held.map((s) => `${s.at}|${s.activity}`));
  const added = incoming.filter((s) => !seen.has(`${s.at}|${s.activity}`));
  if (added.length === 0) return null;

  return [...held, ...added].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
