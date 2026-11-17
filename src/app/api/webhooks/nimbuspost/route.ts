import { prisma } from "@/server/db";
import { checkIpRateLimit } from "@/server/rate-limit/limiter";
import { verifyNimbusPostSignature } from "@/server/integrations/nimbuspost";
import { nimbuspostWebhookSecret } from "@/server/settings/courier-config";
import { applyCourierUpdate } from "@/server/couriers/apply-update";
import type { OrderStatus } from "@/generated/prisma/client";

/**
 * NimbusPost tracking webhook — the NimbusPost twin of the Shiprocket route.
 *
 * NimbusPost pushes `tracking.updated` (every courier scan) and
 * `order.updated` (booked, shipped, cancelled, delivered, RTO…). Both carry
 * the same flat body; this turns the statuses that matter to a shopper into
 * our order status and keeps every scan for the tracking page. The shared
 * rules — forward-only, compare-and-set, the Delivered email exactly once —
 * live in server/couriers/apply-update.ts.
 *
 * ── Auth ─────────────────────────────────────────────────────────────────────
 * Stronger than Shiprocket's: NimbusPost SIGNS each delivery. The
 * `x-nimbus-signature` header is an HMAC-SHA256 of the raw body keyed with
 * the subscription secret (set by Connect tracking on the Courier page —
 * server/settings/courier-config.ts), checked on the exact
 * bytes before the JSON is parsed. Deliveries can repeat; that is harmless,
 * because the status move is forward-only and the scan trail de-duplicates.
 *
 * Registered from the Courier page (Connect tracking), which points
 * NimbusPost at https://www.mysilvers.in/api/webhooks/nimbuspost.
 */

/**
 * NimbusPost's lower-case status strings. Only the moves that mean something
 * to a shopper are mapped; in-transit scans are recorded but move nothing.
 */
const STATUS_MAP: Record<string, OrderStatus> = {
  picked: "shipped",
  "picked up": "shipped",
  "pickup completed": "shipped",
  shipped: "shipped",
  "in transit": "shipped",
  "out for delivery": "shipped",
  delivered: "delivered",
  cancelled: "cancelled",
  "rto initiated": "returned",
  "rto in transit": "returned",
  "rto out for delivery": "returned",
  "rto delivered": "returned",
};

/** The courier status codes, for pushes whose `status` text is missing or unfamiliar. */
const CODE_MAP: Record<string, OrderStatus> = {
  IT: "shipped",
  OFD: "shipped",
  DL: "delivered",
  RT: "returned",
  "RT-IT": "returned",
  "RT-DL": "returned",
};

export async function POST(req: Request) {
  if (!(await checkIpRateLimit("nimbuspostWebhook"))) {
    return new Response("Too many requests", { status: 429 });
  }

  // The signature covers the bytes exactly as sent — read them before parsing.
  const raw = await req.text();
  if (!verifyNimbusPostSignature(raw, req.headers.get("x-nimbus-signature"), await nimbuspostWebhookSecret())) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event: {
    awb_number?: string;
    order_number?: string;
    status?: string;
    status_code?: string;
    event_time?: string;
    location?: string;
    message?: string;
    courier_name?: string;
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("Malformed body", { status: 400 });
  }

  const awb = event.awb_number?.trim() || null;
  const orderNumber = event.order_number?.trim() || null;
  const status = (event.status ?? "").trim().toLowerCase();
  const next = STATUS_MAP[status] ?? CODE_MAP[(event.status_code ?? "").trim().toUpperCase()];

  // AWB first — the identifier the courier owns. order_number is our own
  // number echoed back, the fallback for order events before a waybill exists.
  const order = awb
    ? await prisma.order.findFirst({ where: { trackingNumber: awb, courierProvider: "nimbuspost" } })
    : orderNumber
      ? await prisma.order.findFirst({ where: { orderNumber, courierProvider: "nimbuspost" } })
      : null;

  // 2xx even when unknown: a failing endpoint gets switched off by NimbusPost.
  if (!order) return new Response("Unknown shipment", { status: 200 });

  const scan =
    event.event_time && (event.message || event.status)
      ? [
          {
            // NimbusPost sends UTC as "YYYY-MM-DD HH:mm:ss".
            at: `${event.event_time.replace(" ", "T")}Z`,
            activity: (event.message || event.status || "").trim(),
            location: event.location?.trim() || null,
          },
        ]
      : [];

  const moved = await applyCourierUpdate(order, {
    next,
    scans: scan,
    courierName: event.courier_name?.trim() || null,
  });

  return new Response(moved ? "OK" : "Recorded", { status: 200 });
}
