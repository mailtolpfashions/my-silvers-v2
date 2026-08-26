import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/server/db";

/**
 * The shop's operational switches.
 *
 * Everything here is something the owner changes by decision rather than by
 * deploy — whether cash on delivery is offered this month, whether guests may
 * check out, what shipping costs. Read through {@link getStoreSettings}; never
 * query the StoreSetting table directly, or the defaults below stop being the
 * single answer to "what happens when the row is missing".
 */
export type StoreSettings = {
  /**
   * Whether cash on delivery is offered at checkout.
   *
   * ⚠️  Off is the default, and that is a business decision, not caution: COD
   * is not currently offered. Turning this on makes the option appear at
   * checkout immediately — there is no separate publish step.
   *
   * Disabling it only stops NEW COD orders. Orders already placed as COD keep
   * `paymentMethod: "cod"` forever and must keep rendering everywhere — the
   * admin order screens, invoices, refunds, Shiprocket, the finance figures.
   * That is why the `cod` value stays in the PaymentMethod enum regardless of
   * this flag.
   */
  codEnabled: boolean;

  /**
   * Whether someone without an account can complete an order.
   *
   * Off sends them to /login from the checkout page and rejects the order
   * action, but leaves the guest CART working — a shopper should be able to
   * fill a basket and only then be asked to sign in, not be stopped at the
   * point of adding.
   */
  guestCheckoutEnabled: boolean;

  /** Flat shipping charge, in paise, applied below the free threshold. */
  shippingChargePaise: number;

  /** Order subtotal, in paise, at or above which shipping is free. */
  freeShippingThresholdPaise: number;
};

/**
 * What the shop does when nothing has been configured.
 *
 * ⚠️  These are the live production values for an unseeded database, not
 * placeholders. A missing row must always mean "use the default" and never
 * "fail closed on everything" — otherwise a fresh deploy is a shop that cannot
 * take an order.
 */
export const STORE_SETTING_DEFAULTS: StoreSettings = {
  codEnabled: false,
  guestCheckoutEnabled: true,
  shippingChargePaise: 49 * 100,
  freeShippingThresholdPaise: 999 * 100,
};

/** Cache tag for every settings read. Invalidated by the admin save action. */
export const STORE_SETTINGS_TAG = "settings";

/** The single row key. One JSON blob, so a save is one atomic upsert. */
const SETTINGS_KEY = "store";

/**
 * Coerces a stored blob into a complete StoreSettings.
 *
 * Field-by-field rather than a spread, because the JSON column is not typed by
 * the database: a hand-edited row, or a key written by an older version of this
 * file, must not be able to put a string where the checkout expects a number.
 * Anything that does not survive its own type check falls back to the default.
 */
function parse(raw: unknown): StoreSettings {
  const d = STORE_SETTING_DEFAULTS;
  if (typeof raw !== "object" || raw === null) return d;
  const v = raw as Record<string, unknown>;

  const bool = (x: unknown, fallback: boolean) => (typeof x === "boolean" ? x : fallback);
  /**
   * Non-negative integers only. A negative shipping charge would pay the
   * customer to order, and a fractional paise value would break the integer
   * money arithmetic every total in the app depends on.
   */
  const paise = (x: unknown, fallback: number) =>
    typeof x === "number" && Number.isSafeInteger(x) && x >= 0 ? x : fallback;

  return {
    codEnabled: bool(v.codEnabled, d.codEnabled),
    guestCheckoutEnabled: bool(v.guestCheckoutEnabled, d.guestCheckoutEnabled),
    shippingChargePaise: paise(v.shippingChargePaise, d.shippingChargePaise),
    freeShippingThresholdPaise: paise(
      v.freeShippingThresholdPaise,
      d.freeShippingThresholdPaise
    ),
  };
}

/**
 * The current settings.
 *
 * Cached, because this is read on the cart, the checkout, and every order —
 * three of the hottest paths in the app — to answer a question that changes
 * perhaps twice a year. The admin save calls `updateTag(STORE_SETTINGS_TAG)`,
 * so a change is visible on the next request rather than after the revalidate
 * window; the window only matters if a row is edited outside the app.
 *
 * ⚠️  Falls back to the defaults if the database is unreachable rather than
 * throwing. A settings lookup failing is not a reason for the cart page to be
 * a 500 — the worst case is that the shop briefly behaves as a freshly
 * installed one, which is a state it is designed to work in.
 *
 * "Briefly" is doing real work in that sentence, and used not to be true — see
 * readStoreSettings for why the catch has to sit out here, outside the cache.
 */
export async function getStoreSettings(): Promise<StoreSettings> {
  try {
    return await readStoreSettings();
  } catch (err) {
    console.error("getStoreSettings failed — falling back to defaults", err);
    return STORE_SETTING_DEFAULTS;
  }
}

/**
 * The cached read. Throws rather than falling back, and that is the point.
 *
 * ⚠️  The try/catch used to live INSIDE this function, above the `"use cache"`
 * boundary's return — which meant the fallback was a successful return value
 * and got CACHED. One unreachable database, for one instant, pinned the whole
 * shop to a freshly-installed configuration for the length of the cache
 * window: ₹49 shipping instead of the configured charge, and cash on delivery
 * showing as unavailable. Nothing was broken and nothing was logged twice; the
 * shop just quietly quoted the wrong price to everyone for the next minute.
 *
 * Split, a failure is a rejected promise, which `"use cache"` does not store.
 * The very next request tries the database again, and only a real answer is
 * ever cached. The fallback still exists — a settings lookup failing is not a
 * reason for the cart to be a 500 — but it is now per-request rather than
 * something that sticks.
 */
async function readStoreSettings(): Promise<StoreSettings> {
  "use cache";
  cacheLife("settings");
  cacheTag(STORE_SETTINGS_TAG);

  const row = await prisma.storeSetting.findUnique({ where: { key: SETTINGS_KEY } });
  return parse(row?.value);
}

/**
 * Writes the settings.
 *
 * Not cached and not exported to anything but the admin action — callers that
 * want to READ must go through getStoreSettings so they share its cache.
 * Values are run through `parse` on the way in as well as on the way out, so a
 * malformed write cannot land in the first place.
 */
export async function saveStoreSettings(next: StoreSettings): Promise<StoreSettings> {
  const value = parse(next);
  await prisma.storeSetting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value },
    update: { value },
  });
  return value;
}
