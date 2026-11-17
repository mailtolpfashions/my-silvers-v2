/**
 * NimbusPost courier integration — the Partner API v2 (api-v2.nimbuspost.com).
 *
 * The second courier partner beside Shiprocket (integrations/shiprocket.ts).
 * Written against NimbusPost's OpenAPI spec for the v2 API, which the owner
 * downloaded from their dashboard; the older v1 / ship.nimbuspost.com APIs
 * reject this account's keys.
 *
 * ── Auth ─────────────────────────────────────────────────────────────────────
 * Two headers on every request — `x-api-key` (the key id, `npk_…`) and
 * `x-api-secret`. No login and no token, so none of Shiprocket's lockout
 * hazard: a wrong key is a plain 401, not an account lock.
 *
 * ── Money ────────────────────────────────────────────────────────────────────
 * Unlike Shiprocket there is no free "create order" step worth using here:
 * POST /v2/shipments creates the order AND books a courier, and `price.total`
 * is deducted from the NimbusPost wallet right then. So bookNimbusPost is only
 * ever called from an explicit "Book" click. Rate checks are free. Cancelling
 * before pickup refunds the wallet.
 *
 * ── Units ────────────────────────────────────────────────────────────────────
 * The rate check takes GRAMS and PAISE; the booking takes KILOGRAMS and
 * RUPEES. That is NimbusPost's design, not a slip here — the spec calls it out.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { ScanEvent } from "@/server/integrations/shiprocket";
import { nimbuspostWarehouseId } from "@/server/settings/courier-config";

const BASE = "https://api-v2.nimbuspost.com/v2";

export class NimbusPostError extends Error {
  constructor(
    message: string,
    /** NimbusPost's stable error code, e.g. VALIDATION_FAILED, when it sent one. */
    public code?: string
  ) {
    super(message);
    this.name = "NimbusPostError";
  }
}

/** Both halves of the key pair are set. Says nothing about whether they are valid. */
export function isNimbusPostConfigured(): boolean {
  return Boolean(process.env.NIMBUSPOST_API_KEY && process.env.NIMBUSPOST_API_SECRET);
}

/** The pickup pincode NimbusPost quotes from — its own setting, else the shop's Shiprocket one. */
function pickupPincode(): string {
  const pin = process.env.NIMBUSPOST_PICKUP_PINCODE || process.env.SHIPROCKET_PICKUP_PINCODE;
  if (!pin) throw new NimbusPostError("NIMBUSPOST_PICKUP_PINCODE is not set.");
  return pin;
}

async function npFetch<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
  const key = process.env.NIMBUSPOST_API_KEY;
  const secret = process.env.NIMBUSPOST_API_SECRET;
  if (!key || !secret) {
    throw new NimbusPostError("NimbusPost is not connected — add NIMBUSPOST_API_KEY and NIMBUSPOST_API_SECRET.");
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        "x-api-key": key,
        "x-api-secret": secret,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new NimbusPostError("Could not reach NimbusPost. Please try again.");
  }

  const json = (await res.json().catch(() => null)) as
    | { success?: boolean; data?: T; error?: { code?: string; detail?: string } }
    | null;

  if (!res.ok || !json || json.success === false) {
    const code = json?.error?.code;
    const detail = json?.error?.detail;
    if (res.status === 401) {
      throw new NimbusPostError("NimbusPost rejected the API key — check NIMBUSPOST_API_KEY and NIMBUSPOST_API_SECRET.", code);
    }
    if (res.status === 403) {
      throw new NimbusPostError("This NimbusPost API key is read-only (viewer). Give it the admin role in NimbusPost → Settings → API Keys.", code);
    }
    throw new NimbusPostError(detail || `NimbusPost request failed (${res.status}).`, code);
  }
  return json.data as T;
}

// ─── Rates ───────────────────────────────────────────────────────────────────

export type NimbusPostQuote = {
  courierId: string;
  courierName: string;
  estimatedDays: number | null;
  /** Rupees, GST-exclusive, as NimbusPost quotes them. */
  freight: number;
  codCharges: number;
  /** Everything else NimbusPost adds — surcharges, insurance. */
  otherCharges: number;
  /** GST-exclusive total, rupees. */
  total: number;
};

/** Free and read-only. Couriers that can't carry the parcel are simply absent. */
export async function quoteNimbusPost(input: {
  deliveryPincode: string;
  weightGrams: number;
  cod: boolean;
  orderValueRupees: number;
}): Promise<NimbusPostQuote[]> {
  type Available = {
    courierId?: string;
    courierName?: string;
    courierDisplayName?: string;
    tatDays?: number;
    result?: {
      shippingChargesPaise?: number;
      codChargesPaise?: number;
      surchargesPaise?: number;
      insurancePaise?: number;
      totalPaise?: number;
    };
  };
  const data = await npFetch<{ available?: Available[] }>("POST", "/serviceability", {
    pickupPincode: pickupPincode(),
    deliveryPincode: input.deliveryPincode,
    paymentMode: input.cod ? "cod" : "prepaid",
    packages: [{ weight: Math.max(1, Math.round(input.weightGrams)), length: 10, width: 10, height: 5 }],
    orderValuePaise: Math.round(input.orderValueRupees * 100),
  });

  const rupees = (p?: number) => (p ?? 0) / 100;
  return (data.available ?? [])
    .filter((c) => c.courierId && c.result?.totalPaise !== undefined)
    .map((c) => ({
      courierId: c.courierId!,
      courierName: c.courierName || c.courierDisplayName || "Courier",
      estimatedDays: typeof c.tatDays === "number" ? c.tatDays : null,
      freight: rupees(c.result!.shippingChargesPaise),
      codCharges: rupees(c.result!.codChargesPaise),
      otherCharges: rupees(c.result!.surchargesPaise) + rupees(c.result!.insurancePaise),
      total: rupees(c.result!.totalPaise),
    }));
}

// ─── Booking ─────────────────────────────────────────────────────────────────

export type NimbusPostBookingInput = {
  orderNumber: string;
  orderDate: Date;
  courierId: string;
  cod: boolean;
  /** What the courier collects on delivery (COD) — the order total, rupees. */
  orderTotal: number;
  customer: { name: string; email: string; phone: string };
  address: { addressLine1: string; addressLine2?: string; city: string; state: string; pincode: string };
  items: Array<{ name: string; sku: string; qty: number; price: number; size?: string }>;
  weightGrams: number;
};

export type NimbusPostBooking = {
  nimbuspostOrderId: string;
  awb: string;
  courierName: string;
  trackingUrl: string;
  /** Rupees deducted from the NimbusPost wallet. */
  charged: number | null;
};

/**
 * ⚠️  BOOKS A COURIER AND CHARGES THE WALLET. Called only from an explicit
 * "Book" click in the admin. A route no courier serves still creates the
 * order in NimbusPost but returns 400 — surfaced as an error, nothing booked.
 */
export async function bookNimbusPost(input: NimbusPostBookingInput): Promise<NimbusPostBooking> {
  const warehouseId = await nimbuspostWarehouseId();
  if (!warehouseId) {
    throw new NimbusPostError(
      "No NimbusPost pickup warehouse is set — add or choose one on the Courier page."
    );
  }
  const digits = (s: string) => Number(s.replace(/\D/g, "").slice(-10));

  type Booked = {
    order?: { order_id?: string };
    booking?: {
      order_id?: string;
      awb?: string;
      courier_name?: string;
      tracking_url?: string;
      tracking_short_url?: string;
      price?: { total?: number };
    };
  };
  const data = await npFetch<Booked>("POST", "/shipments", {
    // NimbusPost keeps only letters, digits, "-" and "#" — MYS-000014 survives as is.
    order_number: input.orderNumber,
    order_type: "b2c",
    order_date: input.orderDate.toISOString(),
    payment_mode: input.cod ? "cod" : "prepaid",
    ...(input.cod ? { order_collectable_amount: input.orderTotal } : {}),
    // The declared total — so NimbusPost's own arithmetic (items + tax +
    // charges) can't disagree with what the customer actually paid.
    order_amount: input.orderTotal,
    warehouse_id: warehouseId,
    courier_id: input.courierId,
    shipping_address: {
      name: input.customer.name,
      email: input.customer.email,
      address: input.address.addressLine1,
      ...(input.address.addressLine2 ? { address_opt: input.address.addressLine2 } : {}),
      city: input.address.city,
      state: input.address.state,
      pincode: Number(input.address.pincode),
      country: "India",
      phone: digits(input.customer.phone),
    },
    billing_same_as_shipping: true,
    items: input.items.map((i) => ({
      name: i.name,
      sku: i.sku,
      qty: i.qty,
      price: i.price,
      ...(i.size ? { variant: `Size ${i.size}` } : {}),
    })),
    package: {
      weight: Math.max(0.05, input.weightGrams / 1000),
      length: 10,
      width: 10,
      height: 5,
    },
  });

  const b = data.booking;
  if (!b?.awb) {
    throw new NimbusPostError("NimbusPost accepted the order but returned no AWB — check the wallet balance, then retry.");
  }
  return {
    nimbuspostOrderId: String(b.order_id ?? data.order?.order_id ?? ""),
    awb: b.awb,
    courierName: b.courier_name ?? "NimbusPost courier",
    trackingUrl: b.tracking_short_url || b.tracking_url || "",
    charged: typeof b.price?.total === "number" ? b.price.total : null,
  };
}

/** Cancels a booked shipment before pickup; NimbusPost refunds the wallet. */
export async function cancelNimbusPost(awb: string): Promise<void> {
  await npFetch("POST", "/shipments/cancel", { awb, reason: "Order cancelled by the shop" });
}

/** Asks the courier to collect it (next working day by default). */
export async function scheduleNimbusPostPickup(nimbuspostOrderId: string): Promise<{ scheduledFor: string | null }> {
  const data = await npFetch<{ pickup_date?: string; courier_scheduled?: boolean }>("POST", "/shipments/pickup", {
    order_ids: [nimbuspostOrderId],
  });
  return { scheduledFor: data?.pickup_date || null };
}

/** The courier label PDF. The link expires, so it is fetched fresh each time. */
export async function nimbusPostLabel(nimbuspostOrderId: string): Promise<{ labelUrl: string }> {
  const data = await npFetch<{ url?: string }>("POST", "/shipments/labels", { order_ids: [nimbuspostOrderId] });
  if (!data?.url) throw new NimbusPostError("NimbusPost did not return a label link — is the courier booked?");
  return { labelUrl: data.url };
}

/** Full scan history for one AWB, in our ScanEvent shape. */
export async function trackNimbusPost(awb: string): Promise<ScanEvent[]> {
  const data = await npFetch<{
    scans?: Array<{ timestamp?: string | null; status?: string | null; remark?: string | null; location?: string | null }>;
  }>("GET", `/tracking/${encodeURIComponent(awb)}`);
  return (data.scans ?? [])
    .map((s) => ({
      at: s.timestamp ?? "",
      activity: (s.remark || s.status || "").trim(),
      location: s.location || null,
    }))
    .filter((s) => s.at && s.activity);
}

// ─── Account set-up (the Courier page) ───────────────────────────────────────

/** Rupees the NimbusPost wallet can spend on bookings right now. */
export async function nimbusPostWalletBalance(): Promise<number> {
  const data = await npFetch<{ usable_balance?: number; balance?: string }>("GET", "/wallet/balance");
  return Number(data.usable_balance ?? data.balance ?? 0);
}

export type NimbusPostWarehouse = {
  id: string;
  name: string;
  status: string;
  pincode: string;
  city: string;
};

export async function listNimbusPostWarehouses(): Promise<NimbusPostWarehouse[]> {
  type Row = {
    warehouse_id?: string;
    name?: string;
    status?: string;
    address?: { pincode?: number | string; city?: string };
  };
  const rows = await npFetch<Row[]>("GET", "/warehouses");
  return (rows ?? [])
    .filter((r) => r.warehouse_id)
    .map((r) => ({
      id: r.warehouse_id!,
      name: r.name ?? "Warehouse",
      status: r.status ?? "active",
      pincode: r.address?.pincode ? String(r.address.pincode) : "",
      city: r.address?.city ?? "",
    }));
}

/** Step 1 of adding a warehouse: NimbusPost texts an OTP to the pickup contact. */
export async function sendNimbusPostWarehouseOtp(phone: string): Promise<{ resendInSec: number | null }> {
  const data = await npFetch<{ otp_sent?: boolean; resend_in_sec?: number }>("POST", "/warehouses/otp/send", {
    phone: Number(phone),
    purpose: "pickup",
  });
  if (data?.otp_sent === false) throw new NimbusPostError("NimbusPost could not send the OTP. Please try again.");
  return { resendInSec: data?.resend_in_sec ?? null };
}

/** Step 2: the OTP the contact received → a verification id for step 3. */
export async function verifyNimbusPostWarehouseOtp(phone: string, otp: string): Promise<string> {
  const data = await npFetch<{ verified?: boolean; verification_id?: string }>("POST", "/warehouses/otp/verify", {
    phone: Number(phone),
    otp,
    purpose: "pickup",
  });
  if (!data?.verified || !data.verification_id) throw new NimbusPostError("That OTP didn't match. Check it and try again.");
  return data.verification_id;
}

export type NewWarehouse = {
  name: string;
  address: string;
  addressOpt?: string;
  pincode: string;
  city: string;
  state: string;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  gst?: string;
  verificationId: string;
};

/**
 * Step 3: create it. Returns become this same warehouse (no second OTP).
 * A warehouse with the same name is returned instead of duplicated.
 */
export async function createNimbusPostWarehouse(w: NewWarehouse): Promise<{ id: string; name: string; created: boolean }> {
  const data = await npFetch<{ warehouse_id?: string; name?: string; created?: boolean }>("POST", "/warehouses", {
    name: w.name,
    display_name: w.name,
    address: {
      address: w.address,
      ...(w.addressOpt ? { address_opt: w.addressOpt } : {}),
      pincode: Number(w.pincode),
      city: w.city,
      state: w.state,
      country: "India",
    },
    contact_person: {
      name: w.contactName,
      phone: Number(w.contactPhone),
      ...(w.contactEmail ? { email: w.contactEmail } : {}),
      phone_verified: true,
      verification_id: w.verificationId,
    },
    ...(w.gst ? { gst: w.gst } : {}),
    is_primary: true,
    status: "active",
    rto_same_as_pickup: true,
  });
  if (!data?.warehouse_id) throw new NimbusPostError("NimbusPost did not return the new warehouse's ID.");
  return { id: data.warehouse_id, name: data.name ?? w.name, created: data.created !== false };
}

/**
 * Registers our tracking webhook, signed with a secret WE generate — so it can
 * be stored on our side without NimbusPost ever having to show it to anyone.
 */
export async function createNimbusPostWebhook(url: string, secret: string): Promise<{ id: string }> {
  const data = await npFetch<{ id?: string }>("POST", "/webhooks", {
    name: "MY Silvers tracking",
    url,
    events: ["tracking.updated", "order.updated"],
    secret,
  });
  if (!data?.id) throw new NimbusPostError("NimbusPost did not return the webhook's ID.");
  return { id: data.id };
}

export type NimbusPostWebhookStatus = {
  id: string;
  url: string;
  status: string;
  lastDeliveryAt: string | null;
  lastDeliveryStatus: number | null;
  autoPaused: boolean;
};

export async function listNimbusPostWebhooks(): Promise<NimbusPostWebhookStatus[]> {
  type Row = {
    id?: string;
    url?: string;
    status?: string;
    lastDeliveryAt?: string | null;
    lastDeliveryStatus?: number | null;
    autoPausedAt?: string | null;
  };
  const rows = await npFetch<Row[]>("GET", "/webhooks");
  return (rows ?? [])
    .filter((r) => r.id)
    .map((r) => ({
      id: r.id!,
      url: r.url ?? "",
      status: r.status ?? "",
      lastDeliveryAt: r.lastDeliveryAt ?? null,
      lastDeliveryStatus: r.lastDeliveryStatus ?? null,
      autoPaused: Boolean(r.autoPausedAt),
    }));
}

// ─── Webhooks ────────────────────────────────────────────────────────────────

/**
 * `x-nimbus-signature` is "sha256=" + hex HMAC-SHA256 of the RAW body, keyed
 * with the subscription's secret (server/settings/courier-config.ts). Checked
 * on the exact bytes received, before any JSON parsing, in constant time.
 */
export function verifyNimbusPostSignature(rawBody: string, header: string | null, secret: string | null): boolean {
  if (!secret || !header) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
