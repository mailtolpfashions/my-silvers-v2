/**
 * The courier partners, behind one set of calls.
 *
 * Shiprocket and NimbusPost each have their own client
 * (integrations/shiprocket.ts, integrations/nimbuspost.ts). Everything that
 * ships, cancels, schedules a pickup or tracks a parcel goes through here and
 * dispatches on the order's `courierProvider`, so no other file needs to know
 * which partner a parcel went with.
 *
 * Which partners are used is the owner's setting (`courierPartners` in store
 * settings); a partner whose keys are missing is skipped whatever it says.
 */
import { kvGet, kvSet } from "@/server/cache/kv";
import {
  checkServiceability,
  checkServiceabilityCached,
  createShiprocketOrder,
  assignShiprocketAwb,
  cancelShiprocketAwbs,
  cancelShiprocketOrders,
  schedulePickup as scheduleShiprocketPickup,
  generateLabel as shiprocketLabel,
  trackByAwb as trackShiprocket,
  type ShipmentInput,
  type ScanEvent,
} from "@/server/integrations/shiprocket";
import {
  isNimbusPostConfigured,
  quoteNimbusPost,
  bookNimbusPost,
  cancelNimbusPost,
  scheduleNimbusPostPickup,
  nimbusPostLabel,
  trackNimbusPost,
} from "@/server/integrations/nimbuspost";
import {
  PROVIDER_LABEL,
  rankQuotes,
  withGst,
  type CourierProviderId,
  type CourierQuote,
} from "@/lib/courier-quotes";

/** Which partners have their credentials set. Says nothing about whether they're valid. */
export function courierConnections(): Record<CourierProviderId, boolean> {
  return {
    shiprocket: Boolean(process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD),
    nimbuspost: isNimbusPostConfigured(),
  };
}

/** Switched on in Settings AND connected. */
export function activePartners(setting: Record<CourierProviderId, boolean>): CourierProviderId[] {
  const connected = courierConnections();
  return (Object.keys(setting) as CourierProviderId[]).filter((p) => setting[p] && connected[p]);
}

export type QuoteRequest = {
  deliveryPincode: string;
  weightGrams: number;
  cod: boolean;
  orderValueRupees: number;
};

/**
 * Every courier from every active partner, cheapest (all-in, GST included)
 * first. Free — rate checks book nothing. A partner that fails is reported in
 * `errors` and the others still come back, so one partner's outage never
 * stops a parcel going out with the other.
 */
export async function quoteAll(
  partners: CourierProviderId[],
  req: QuoteRequest
): Promise<{ quotes: CourierQuote[]; errors: Array<{ provider: CourierProviderId; message: string }> }> {
  const results = await Promise.allSettled(partners.map((p) => quoteOne(p, req)));
  const quotes: CourierQuote[] = [];
  const errors: Array<{ provider: CourierProviderId; message: string }> = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") quotes.push(...r.value);
    else {
      const message = r.reason instanceof Error ? r.reason.message : "Could not get prices.";
      console.error(`[couriers] ${partners[i]} quote failed:`, message);
      errors.push({ provider: partners[i], message });
    }
  });
  return { quotes: rankQuotes(quotes), errors };
}

async function quoteOne(provider: CourierProviderId, req: QuoteRequest): Promise<CourierQuote[]> {
  if (provider === "shiprocket") {
    const s = await checkServiceability({
      deliveryPincode: req.deliveryPincode,
      // Shiprocket wants kilograms with a 0.5 kg courier minimum.
      weightKg: Math.max(0.5, req.weightGrams / 1000),
      cod: req.cod,
      declaredValue: req.orderValueRupees,
    });
    return s.couriers.map((c) => ({
      provider,
      courierId: String(c.id),
      courierName: c.name,
      estimatedDays: c.estimatedDays,
      freight: c.freight,
      codCharges: c.codCharges,
      otherCharges: Math.max(0, Math.round((c.rate - c.freight - c.codCharges) * 100) / 100),
      quoted: c.rate,
      total: withGst(provider, c.rate),
    }));
  }
  const list = await quoteNimbusPost(req);
  return list.map((c) => ({
    provider,
    courierId: c.courierId,
    courierName: c.courierName,
    estimatedDays: c.estimatedDays,
    freight: c.freight,
    codCharges: c.codCharges,
    otherCharges: c.otherCharges,
    quoted: c.total,
    total: withGst(provider, c.total),
  }));
}

/**
 * The checkout's "delivers in about N days": serviceable if ANY active partner
 * can reach the pincode, so a pincode one partner can't serve isn't turned
 * away when the other can. Shiprocket first (its answer is cached for six
 * hours); NimbusPost only when Shiprocket is off, unserviceable or down.
 * `unknown` when every partner failed — never a false "we don't deliver".
 */
export async function checkDelivery(
  partners: CourierProviderId[],
  input: { deliveryPincode: string; cod: boolean }
): Promise<{ status: "serviceable"; estimatedDays: number | null } | { status: "unserviceable" } | { status: "unknown" }> {
  let anyAnswered = false;
  for (const p of partners) {
    try {
      if (p === "shiprocket") {
        const r = await checkServiceabilityCached({ deliveryPincode: input.deliveryPincode, weightKg: 0.5, cod: input.cod });
        anyAnswered = true;
        if (r.serviceable) return { status: "serviceable", estimatedDays: r.estimatedDays };
      } else {
        const key = `nimbuspost:svc:${input.deliveryPincode}:${input.cod ? 1 : 0}`;
        let list = await kvGet<Array<{ estimatedDays: number | null }>>(key);
        if (!list) {
          list = (await quoteNimbusPost({ deliveryPincode: input.deliveryPincode, weightGrams: 500, cod: input.cod, orderValueRupees: 1000 }))
            .map((q) => ({ estimatedDays: q.estimatedDays }));
          await kvSet(key, list, 6 * 60 * 60);
        }
        anyAnswered = true;
        if (list.length > 0) {
          const days = list.map((q) => q.estimatedDays).filter((d): d is number => d !== null);
          return { status: "serviceable", estimatedDays: days.length ? Math.min(...days) : null };
        }
      }
    } catch (err) {
      console.error(`[couriers] ${p} delivery check failed:`, err instanceof Error ? err.message : err);
    }
  }
  return anyAnswered ? { status: "unserviceable" } : { status: "unknown" };
}

export type BookingRequest = ShipmentInput & {
  /** What the courier collects on a COD order — the order total, rupees. */
  orderTotal: number;
  weightGrams: number;
  /** An unbooked Shiprocket order already registered for this parcel, if any. */
  existingShiprocket: { orderId: string; shipmentId: string } | null;
};

export type BookingResult = {
  provider: CourierProviderId;
  awb: string;
  courierName: string;
  trackingUrl: string;
  /** Rupees the partner charged, when it says. */
  charged: number | null;
  shiprocket?: { orderId: string; shipmentId: string };
  nimbuspostOrderId?: string;
};

/**
 * ⚠️  BOOKS A COURIER — this is the call that spends money. Only from the
 * admin's explicit Book click (bookShipment in server/orders/admin.ts).
 */
export async function bookCourier(
  provider: CourierProviderId,
  courierId: string,
  req: BookingRequest,
  quotedTotal: number | null
): Promise<BookingResult> {
  if (provider === "shiprocket") {
    // Step one (free) unless it was already done by the old two-button flow.
    let created: { orderId: string; shipmentId: string };
    if (req.existingShiprocket) created = req.existingShiprocket;
    else {
      const r = await createShiprocketOrder(req);
      created = { orderId: r.shiprocketOrderId, shipmentId: r.shiprocketShipmentId };
    }
    const awb = await assignShiprocketAwb(created.shipmentId, Number(courierId) || undefined);
    return {
      provider,
      awb: awb.awbCode,
      courierName: awb.courierName ?? "Shiprocket courier",
      trackingUrl: awb.trackingUrl,
      // Shiprocket's assign call doesn't report the charge; the quote is the best figure we have.
      charged: quotedTotal,
      shiprocket: created,
    };
  }

  // An unbooked Shiprocket registration would sit in that account forever.
  if (req.existingShiprocket) {
    await cancelShiprocketOrders([req.existingShiprocket.orderId]).catch((err) =>
      console.error("[couriers] could not cancel the unbooked Shiprocket order", req.orderNumber, err)
    );
  }
  const booked = await bookNimbusPost({
    orderNumber: req.orderNumber,
    orderDate: req.orderDate,
    courierId,
    cod: req.paymentMethod === "COD",
    orderTotal: req.orderTotal,
    customer: req.customer,
    address: req.address,
    items: req.items.map((i) => ({ name: i.name, sku: i.sku, qty: i.units, price: i.sellingPrice })),
    weightGrams: req.weightGrams,
  });
  return {
    provider,
    awb: booked.awb,
    courierName: booked.courierName,
    trackingUrl: booked.trackingUrl,
    charged: booked.charged,
    nimbuspostOrderId: booked.nimbuspostOrderId,
  };
}

/** The partner an order's parcel is with. Orders from before NimbusPost are Shiprocket's. */
export function providerOf(order: { courierProvider: CourierProviderId | null }): CourierProviderId {
  return order.courierProvider ?? "shiprocket";
}

/** Cancels whatever is booked or registered with the order's partner. Throws on failure. */
export async function cancelCourier(order: {
  courierProvider: CourierProviderId | null;
  trackingNumber: string | null;
  shiprocketOrderId: string | null;
}): Promise<void> {
  if (providerOf(order) === "nimbuspost") {
    if (order.trackingNumber) await cancelNimbusPost(order.trackingNumber);
    return;
  }
  if (order.trackingNumber) await cancelShiprocketAwbs([order.trackingNumber]);
  else if (order.shiprocketOrderId) await cancelShiprocketOrders([order.shiprocketOrderId]);
}

/** Pickup request + label, with whichever partner booked it. */
export async function pickupAndLabel(order: {
  courierProvider: CourierProviderId | null;
  shiprocketShipmentId: string | null;
  nimbuspostOrderId: string | null;
}): Promise<{ scheduledFor: string | null; labelUrl: string }> {
  if (providerOf(order) === "nimbuspost") {
    if (!order.nimbuspostOrderId) throw new Error("This order has no NimbusPost booking.");
    const [pickup, label] = await Promise.all([
      scheduleNimbusPostPickup(order.nimbuspostOrderId),
      nimbusPostLabel(order.nimbuspostOrderId),
    ]);
    return { scheduledFor: pickup.scheduledFor, labelUrl: label.labelUrl };
  }
  if (!order.shiprocketShipmentId) throw new Error("Create the Shiprocket shipment first.");
  const [pickup, label] = await Promise.all([
    scheduleShiprocketPickup(order.shiprocketShipmentId),
    shiprocketLabel(order.shiprocketShipmentId),
  ]);
  return { scheduledFor: pickup.scheduledFor, labelUrl: label.labelUrl };
}

/** Scan history for a waybill, from whichever partner carries it. */
export async function trackCourier(
  order: { courierProvider: CourierProviderId | null },
  awb: string
): Promise<ScanEvent[]> {
  return providerOf(order) === "nimbuspost" ? trackNimbusPost(awb) : trackShiprocket(awb);
}

export { PROVIDER_LABEL };
