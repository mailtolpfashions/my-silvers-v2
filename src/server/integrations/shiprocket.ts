/**
 * Shiprocket courier integration — two sequential HTTP calls (create order,
 * assign AWB) run inline from the admin Server Action per the plan; no queue.
 * Auth tokens are obtained from email/password login and cached in-module
 * (Shiprocket tokens last ~10 days; we refresh after 8).
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

async function srFetch(path: string, body: unknown, retried = false): Promise<Record<string, unknown>> {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
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

export type ShipmentResult = {
  shiprocketOrderId: string;
  shiprocketShipmentId: string;
  awbCode: string;
  courierName: string | null;
  trackingUrl: string;
};

export async function createShiprocketShipment(input: ShipmentInput): Promise<ShipmentResult> {
  const [firstName, ...rest] = input.customer.name.trim().split(/\s+/);

  const orderRes = await srFetch("/orders/create/adhoc", {
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

  const shipmentId = orderRes.shipment_id;
  const srOrderId = orderRes.order_id;
  if (!shipmentId || !srOrderId) {
    throw new ShiprocketError("Shiprocket did not return order/shipment ids.");
  }

  const awbRes = await srFetch("/courier/assign/awb", { shipment_id: shipmentId });
  // Response shape: { awb_assign_status, response: { data: { awb_code, courier_name } } }
  const awbData =
    (awbRes.response as { data?: { awb_code?: string; courier_name?: string } } | undefined)
      ?.data ?? (awbRes as { awb_code?: string; courier_name?: string });
  const awbCode = awbData?.awb_code;
  if (!awbCode) {
    throw new ShiprocketError(
      "Shiprocket order created but AWB assignment failed — retry from the admin panel."
    );
  }

  return {
    shiprocketOrderId: String(srOrderId),
    shiprocketShipmentId: String(shipmentId),
    awbCode,
    courierName: awbData?.courier_name ?? null,
    trackingUrl: `https://shiprocket.co/tracking/${awbCode}`,
  };
}
