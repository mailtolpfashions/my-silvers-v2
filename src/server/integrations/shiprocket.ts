/**
 * Shiprocket courier integration.
 *
 * ── Why the create/AWB split ─────────────────────────────────────────────────
 * This used to be one function that created the order and assigned the AWB back
 * to back. That is the shape the API examples use and it is the wrong shape
 * here, for one reason: Shiprocket has no sandbox. There is no test key, no
 * parallel environment — every call with valid credentials touches the live
 * account. What Shiprocket does have is a billing boundary: creating an order
 * costs nothing and can be cancelled freely, and you are charged when an AWB is
 * assigned and the shipment enters the courier's system.
 *
 * Fusing the two put that boundary inside a single function, so there was no
 * way to exercise the integration without buying a real waybill. Split, the
 * first half IS the test path — and it also matches the dashboard's own
 * two-step flow, which lets an admin see the order land before committing.
 *
 * Keep them separate. If they are ever recombined, testing this file means
 * spending money again.
 *
 * ── Auth ─────────────────────────────────────────────────────────────────────
 * Email/password login returns a JWT good for about ten days. Cached in-module
 * and refreshed after eight, with a single re-login retry on a 401 so an early
 * expiry costs one extra round trip rather than a failed shipment.
 */
const BASE = "https://apiv2.shiprocket.in/v1/external";
const TOKEN_TTL_MS = 8 * 24 * 60 * 60 * 1000;

let cachedToken: { token: string; fetchedAt: number } | null = null;

export class ShiprocketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShiprocketError";
  }
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.SHIPROCKET_EMAIL,
      password: process.env.SHIPROCKET_PASSWORD,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.token) {
    throw new ShiprocketError("Shiprocket login failed — check SHIPROCKET_EMAIL/PASSWORD.");
  }
  cachedToken = { token: data.token, fetchedAt: Date.now() };
  return data.token;
}

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() - cachedToken.fetchedAt < TOKEN_TTL_MS) {
    return cachedToken.token;
  }
  return login();
}

/**
 * One request. `body` undefined means GET — serviceability is the only read in
 * this file, and giving it its own helper would duplicate the auth and the
 * 401 retry for a single call.
 */
async function srFetch(
  path: string,
  body?: unknown,
  retried = false
): Promise<Record<string, unknown>> {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401 && !retried) {
    cachedToken = null; // token expired early — re-login once
    return srFetch(path, body, true);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ShiprocketError(
      `Shiprocket ${path} failed (${res.status}): ${JSON.stringify(data?.message ?? data)}`
    );
  }
  return data as Record<string, unknown>;
}

export type ShipmentInput = {
  orderNumber: string;
  orderDate: Date;
  customer: { name: string; email: string; phone: string };
  address: {
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    pincode: string;
  };
  items: Array<{ name: string; sku: string; units: number; sellingPrice: number }>;
  paymentMethod: "COD" | "Prepaid";
  subTotal: number;
  /** Total weight in KILOGRAMS (product weights are stored in grams — convert before calling). */
  weightKg: number;
};

export type CreatedOrder = {
  shiprocketOrderId: string;
  shiprocketShipmentId: string;
};

/**
 * Step one. Registers the order against the account and returns the ids.
 *
 * FREE and reversible — nothing is booked with a courier, no waybill exists,
 * and cancelShiprocketOrders undoes it completely. This is the call to point a
 * test at.
 */
export async function createShiprocketOrder(input: ShipmentInput): Promise<CreatedOrder> {
  const [firstName, ...rest] = input.customer.name.trim().split(/\s+/);

  const res = await srFetch("/orders/create/adhoc", {
    order_id: input.orderNumber,
    order_date: input.orderDate.toISOString().slice(0, 10),
    pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION || "Primary",
    billing_customer_name: firstName,
    billing_last_name: rest.join(" ") || firstName,
    billing_address: input.address.addressLine1,
    billing_address_2: input.address.addressLine2 ?? "",
    billing_city: input.address.city,
    billing_pincode: input.address.pincode,
    billing_state: input.address.state,
    billing_country: "India",
    billing_email: input.customer.email,
    billing_phone: input.customer.phone,
    shipping_is_billing: true,
    order_items: input.items.map((i) => ({
      name: i.name,
      sku: i.sku,
      units: i.units,
      selling_price: i.sellingPrice,
    })),
    payment_method: input.paymentMethod,
    sub_total: input.subTotal,
    length: 10,
    breadth: 10,
    height: 5,
    weight: input.weightKg,
  });

  const shipmentId = res.shipment_id;
  const srOrderId = res.order_id;
  if (!shipmentId || !srOrderId) {
    throw new ShiprocketError("Shiprocket did not return order/shipment ids.");
  }

  return {
    shiprocketOrderId: String(srOrderId),
    shiprocketShipmentId: String(shipmentId),
  };
}

export type AssignedAwb = {
  awbCode: string;
  courierName: string | null;
  trackingUrl: string;
};

/**
 * Step two. Books a courier and returns the waybill.
 *
 * ⚠️  THIS IS THE CALL THAT COSTS MONEY. It also fails on an empty Shiprocket
 * wallet, which surfaces as a generic API error rather than anything mentioning
 * a balance — check the wallet before assuming the integration is broken.
 *
 * `courierId` omitted lets Shiprocket pick its recommended courier, which is
 * what the admin panel does today. checkServiceability returns the ids if a
 * courier picker is ever added.
 */
export async function assignShiprocketAwb(
  shipmentId: string,
  courierId?: number
): Promise<AssignedAwb> {
  const res = await srFetch("/courier/assign/awb", {
    shipment_id: shipmentId,
    ...(courierId ? { courier_id: courierId } : {}),
  });

  // Shape: { awb_assign_status, response: { data: { awb_code, courier_name } } }
  // — with the fields sometimes hoisted to the top level, hence the fallback.
  const awbData =
    (res.response as { data?: { awb_code?: string; courier_name?: string } } | undefined)?.data ??
    (res as { awb_code?: string; courier_name?: string });
  const awbCode = awbData?.awb_code;
  if (!awbCode) {
    throw new ShiprocketError(
      "Shiprocket accepted the request but returned no AWB — check the wallet balance and courier serviceability, then retry."
    );
  }

  return {
    awbCode,
    courierName: awbData?.courier_name ?? null,
    trackingUrl: `https://shiprocket.co/tracking/${awbCode}`,
  };
}

/**
 * Undoes step one. Only valid before an AWB exists — once a waybill is out,
 * cancelShiprocketAwbs is the call.
 */
export async function cancelShiprocketOrders(shiprocketOrderIds: string[]): Promise<void> {
  if (shiprocketOrderIds.length === 0) return;
  await srFetch("/orders/cancel", { ids: shiprocketOrderIds.map((id) => Number(id) || id) });
}

/**
 * Undoes step two — cancels the booked shipment so the courier does not collect
 * it and the account is not billed for a pickup that should not happen.
 */
export async function cancelShiprocketAwbs(awbCodes: string[]): Promise<void> {
  if (awbCodes.length === 0) return;
  await srFetch("/orders/cancel/shipment/awbs", { awbs: awbCodes });
}

export type Serviceability = {
  serviceable: boolean;
  /** Shiprocket's own estimate, in days, from the cheapest serviceable courier. */
  estimatedDays: number | null;
  /** Cheapest quoted rate in rupees — informational; we do not pass it to the shopper. */
  cheapestRate: number | null;
  couriers: Array<{ id: number; name: string; estimatedDays: number | null; rate: number }>;
};

/**
 * Can we deliver here at all, and roughly how fast.
 *
 * Read-only and free, which is why it is safe to call from checkout. The pickup
 * pincode is ours (SHIPROCKET_PICKUP_PINCODE) and must match the pincode of the
 * pickup location configured in the dashboard, or every lookup comes back
 * unserviceable for reasons that have nothing to do with the shopper.
 */
export async function checkServiceability(input: {
  deliveryPincode: string;
  weightKg: number;
  cod: boolean;
}): Promise<Serviceability> {
  const pickup = process.env.SHIPROCKET_PICKUP_PINCODE;
  if (!pickup) {
    throw new ShiprocketError("SHIPROCKET_PICKUP_PINCODE is not set.");
  }

  const query = new URLSearchParams({
    pickup_postcode: pickup,
    delivery_postcode: input.deliveryPincode,
    weight: String(input.weightKg),
    cod: input.cod ? "1" : "0",
  });

  const res = await srFetch(`/courier/serviceability/?${query.toString()}`);
  const list =
    ((res.data as { available_courier_companies?: unknown[] } | undefined)
      ?.available_courier_companies as
      | Array<{
          courier_company_id?: number;
          courier_name?: string;
          estimated_delivery_days?: string | number;
          rate?: string | number;
        }>
      | undefined) ?? [];

  const couriers = list
    .filter((c) => c.courier_company_id && c.courier_name)
    .map((c) => ({
      id: Number(c.courier_company_id),
      name: String(c.courier_name),
      estimatedDays: Number(c.estimated_delivery_days) || null,
      rate: Number(c.rate) || 0,
    }))
    .sort((a, b) => a.rate - b.rate);

  return {
    serviceable: couriers.length > 0,
    estimatedDays: couriers[0]?.estimatedDays ?? null,
    cheapestRate: couriers[0]?.rate ?? null,
    couriers,
  };
}
