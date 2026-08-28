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

  /**
   * What gift wrap costs, in paise. Zero offers it free.
   *
   * Priced rather than free because that is what this market does: GIVA, the
   * closest comparison for 925 silver in India, charges ₹50 for it. A shopper
   * who has seen that will not read a charge here as mean.
   */
  giftWrapChargePaise: number;

  /**
   * Whether gift wrap is offered at all.
   *
   * Separate from the price, because zero is a legitimate PRICE — free gift
   * wrap — and must not be the only way to switch the option off. Without this
   * flag a shop that wanted to stop offering it during a busy week would have
   * to invent a prohibitive charge instead.
   */
  giftWrapEnabled: boolean;

  /**
   * How many days after delivery a piece may be sent back.
   *
   * ⚠️  Zero means "the shop has not stated a return window", NOT "returns are
   * accepted for zero days". Nothing published to a shopper or to a search
   * engine may be rendered from a zero — see the `hasMerchantReturnPolicy`
   * branch in components/storefront/structured-data.tsx, which omits the whole
   * node rather than claiming a 0-day policy.
   *
   * This exists as a number, separate from the returns copy in the CMS
   * `product-info` singleton, because Google's merchant listings need a machine
   * readable figure and rich text cannot supply one. The two must agree; the
   * prose remains the authority a shopper reads.
   */
  returnWindowDays: number;

  /** Who pays to post a return. Only consulted when returnWindowDays > 0. */
  returnShippingPaidBy: "customer" | "merchant";

  /**
   * Days between an order being placed and it leaving the shop, as a range.
   *
   * Zero on either end means unstated, and suppresses the delivery estimate in
   * structured data entirely — a guessed dispatch time is a promise the shop
   * did not make, and it is the kind of promise a shopper measures you against.
   */
  handlingTimeMinDays: number;
  handlingTimeMaxDays: number;

  /** Days in transit once dispatched, as a range. Zero means unstated. */
  transitTimeMinDays: number;
  transitTimeMaxDays: number;
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
  // ₹50, matching what GIVA charges for the same thing on the same kind of
  // product. A number a shopper in this market has already seen.
  giftWrapChargePaise: 50 * 100,
  giftWrapEnabled: true,

  /**
   * ⚠️  These five default to "unstated", which is the one exception to the
   * note above about defaults being live production values. They are the only
   * settings that become a PUBLIC CLAIM the moment they are non-zero — a return
   * window and a delivery estimate published to Google as structured data.
   *
   * A default of 7 days here would have an unconfigured shop promising a return
   * policy nobody agreed to, in a format a search engine quotes verbatim. Silent
   * is the only safe starting state; the admin fills these in once the policy
   * is decided, and the markup appears at that point and not before.
   */
  returnWindowDays: 0,
  returnShippingPaidBy: "customer",
  handlingTimeMinDays: 0,
  handlingTimeMaxDays: 0,
  transitTimeMinDays: 0,
  transitTimeMaxDays: 0,
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
   * Non-negative integers only — used for both the money fields and the day
   * counts. A negative shipping charge would pay the customer to order, a
   * fractional paise value would break the integer money arithmetic every total
   * in the app depends on, and a negative return window is not a thing.
   */
  const whole = (x: unknown, fallback: number) =>
    typeof x === "number" && Number.isSafeInteger(x) && x >= 0 ? x : fallback;
  /** A string constrained to a known set, or the default. */
  const oneOf = <T extends string>(x: unknown, allowed: readonly T[], fallback: T) =>
    typeof x === "string" && (allowed as readonly string[]).includes(x) ? (x as T) : fallback;

  return {
    codEnabled: bool(v.codEnabled, d.codEnabled),
    guestCheckoutEnabled: bool(v.guestCheckoutEnabled, d.guestCheckoutEnabled),
    shippingChargePaise: whole(v.shippingChargePaise, d.shippingChargePaise),
    freeShippingThresholdPaise: whole(
      v.freeShippingThresholdPaise,
      d.freeShippingThresholdPaise
    ),
    giftWrapChargePaise: whole(v.giftWrapChargePaise, d.giftWrapChargePaise),
    giftWrapEnabled: bool(v.giftWrapEnabled, d.giftWrapEnabled),
    returnWindowDays: whole(v.returnWindowDays, d.returnWindowDays),
    returnShippingPaidBy: oneOf(
      v.returnShippingPaidBy,
      ["customer", "merchant"] as const,
      d.returnShippingPaidBy
    ),
    handlingTimeMinDays: whole(v.handlingTimeMinDays, d.handlingTimeMinDays),
    handlingTimeMaxDays: whole(v.handlingTimeMaxDays, d.handlingTimeMaxDays),
    transitTimeMinDays: whole(v.transitTimeMinDays, d.transitTimeMinDays),
    transitTimeMaxDays: whole(v.transitTimeMaxDays, d.transitTimeMaxDays),
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
