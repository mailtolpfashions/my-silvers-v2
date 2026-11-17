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
  nimbuspostWebhookId: string | null;
  /** HMAC secret for x-nimbus-signature. Never sent to the browser. */
  nimbuspostWebhookSecret: string | null;
};

const KEY = "courier";

const EMPTY: CourierConfig = {
  nimbuspostWarehouseId: null,
  nimbuspostWarehouseName: null,
  nimbuspostWebhookId: null,
  nimbuspostWebhookSecret: null,
};

export async function getCourierConfig(): Promise<CourierConfig> {
  const row = await prisma.storeSetting.findUnique({ where: { key: KEY } });
  const v = (row?.value ?? {}) as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);
  return {
    nimbuspostWarehouseId: str(v.nimbuspostWarehouseId),
    nimbuspostWarehouseName: str(v.nimbuspostWarehouseName),
    nimbuspostWebhookId: str(v.nimbuspostWebhookId),
    nimbuspostWebhookSecret: str(v.nimbuspostWebhookSecret),
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
