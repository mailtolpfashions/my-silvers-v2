import { prisma } from "@/server/db";

/**
 * Courier set-up that the owner does from /admin/courier and the app then
 * needs at booking and webhook time: which NimbusPost warehouse parcels are
 * collected from, and the tracking webhook's subscription and signing secret.
 *
 * Its own StoreSetting row ("courier"), deliberately NOT part of
 * getStoreSettings: that blob is cached and read on every cart and checkout,
 * and the webhook secret has no business riding along on those paths. This
 * row is read only when booking, verifying a webhook, or on the Courier page
 * — uncached, so a just-saved warehouse is used by the very next booking.
 *
 * The env vars (NIMBUSPOST_WAREHOUSE_ID, NIMBUSPOST_WEBHOOK_SECRET) still
 * work and win when set, so a shop configured that way keeps working.
 */
export type CourierConfig = {
  nimbuspostWarehouseId: string | null;
  nimbuspostWarehouseName: string | null;
  /** The warehouse's pincode — where NimbusPost's prices are measured from. */
  nimbuspostWarehousePincode: string | null;
  nimbuspostWebhookId: string | null;
  /** HMAC secret for x-nimbus-signature. Never sent to the browser. */
  nimbuspostWebhookSecret: string | null;
  /** When the last signed NimbusPost tracking push arrived (ISO). */
  nimbuspostLastWebhookAt: string | null;

  /** Shiprocket pickup location NICKNAME, exactly as in their dashboard. */
  shiprocketPickupLocation: string | null;
  /** That location's pincode — where Shiprocket's prices are measured from. */
  shiprocketPickupPincode: string | null;
  /**
   * The token Shiprocket sends back as `x-api-key` on tracking pushes. Set up
   * in Shiprocket's dashboard (their API can't register webhooks), so the
   * Courier page shows it for the owner to copy across.
   */
  shiprocketWebhookToken: string | null;
  /** When the last authenticated Shiprocket tracking push arrived (ISO). */
  shiprocketLastWebhookAt: string | null;
};

const KEY = "courier";

const EMPTY: CourierConfig = {
  nimbuspostWarehouseId: null,
  nimbuspostWarehouseName: null,
  nimbuspostWarehousePincode: null,
  nimbuspostWebhookId: null,
  nimbuspostWebhookSecret: null,
  nimbuspostLastWebhookAt: null,
  shiprocketPickupLocation: null,
  shiprocketPickupPincode: null,
  shiprocketWebhookToken: null,
  shiprocketLastWebhookAt: null,
};

export async function getCourierConfig(): Promise<CourierConfig> {
  const row = await prisma.storeSetting.findUnique({ where: { key: KEY } });
  const v = (row?.value ?? {}) as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);
  return {
    nimbuspostWarehouseId: str(v.nimbuspostWarehouseId),
    nimbuspostWarehouseName: str(v.nimbuspostWarehouseName),
    nimbuspostWarehousePincode: str(v.nimbuspostWarehousePincode),
    nimbuspostWebhookId: str(v.nimbuspostWebhookId),
    nimbuspostWebhookSecret: str(v.nimbuspostWebhookSecret),
    nimbuspostLastWebhookAt: str(v.nimbuspostLastWebhookAt),
    shiprocketPickupLocation: str(v.shiprocketPickupLocation),
    shiprocketPickupPincode: str(v.shiprocketPickupPincode),
    shiprocketWebhookToken: str(v.shiprocketWebhookToken),
    shiprocketLastWebhookAt: str(v.shiprocketLastWebhookAt),
  };
}

/** Merges `patch` into what is stored; fields not named are kept. */
export async function saveCourierConfig(patch: Partial<CourierConfig>): Promise<CourierConfig> {
  const next = { ...EMPTY, ...(await getCourierConfig()), ...patch };
  await prisma.storeSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: next },
    update: { value: next },
  });
  return next;
}

/** The warehouse bookings collect from: the env var if set, else the one chosen on the Courier page. */
export async function nimbuspostWarehouseId(): Promise<string | null> {
  return process.env.NIMBUSPOST_WAREHOUSE_ID || (await getCourierConfig()).nimbuspostWarehouseId;
}

/** The webhook signing secret: the env var if set, else the one stored when tracking was connected. */
export async function nimbuspostWebhookSecret(): Promise<string | null> {
  return process.env.NIMBUSPOST_WEBHOOK_SECRET || (await getCourierConfig()).nimbuspostWebhookSecret;
}

/** Shiprocket's pickup location nickname: the env var if set, else the one chosen on the Courier page. */
export async function shiprocketPickupLocation(): Promise<string> {
  return process.env.SHIPROCKET_PICKUP_LOCATION || (await getCourierConfig()).shiprocketPickupLocation || "Primary";
}

/** The pincode Shiprocket prices from: the env var if set, else the chosen location's. */
export async function shiprocketPickupPincode(): Promise<string | null> {
  return process.env.SHIPROCKET_PICKUP_PINCODE || (await getCourierConfig()).shiprocketPickupPincode;
}

/**
 * The pincode NimbusPost prices from: its own env var, else the chosen
 * warehouse's, else Shiprocket's — right when both collect from one place.
 */
export async function nimbuspostPickupPincode(): Promise<string | null> {
  if (process.env.NIMBUSPOST_PICKUP_PINCODE) return process.env.NIMBUSPOST_PICKUP_PINCODE;
  return (await getCourierConfig()).nimbuspostWarehousePincode || (await shiprocketPickupPincode());
}

/**
 * Either Shiprocket webhook token: the env var (older set-up) or the one made
 * on the Courier page. Both are accepted so switching from one to the other
 * never drops an update in between.
 */
export async function shiprocketWebhookTokens(): Promise<string[]> {
  return [process.env.SHIPROCKET_WEBHOOK_TOKEN, (await getCourierConfig()).shiprocketWebhookToken].filter(
    (t): t is string => Boolean(t)
  );
}

/**
 * Remembers that a tracking push arrived — what the Courier page's "Last
 * update received" shows. Throttled to one write a minute per partner: a busy
 * day is many scans, and the page only needs to know updates are flowing.
 */
export async function noteWebhookReceived(partner: "shiprocket" | "nimbuspost"): Promise<void> {
  try {
    const field = partner === "shiprocket" ? "shiprocketLastWebhookAt" : "nimbuspostLastWebhookAt";
    const last = (await getCourierConfig())[field];
    if (last && Date.now() - Date.parse(last) < 60_000) return;
    await saveCourierConfig({ [field]: new Date().toISOString() });
  } catch (err) {
    console.error("[couriers] could not record the webhook time", err);
  }
}
