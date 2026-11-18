import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/server/db";
import type { CharmStyle } from "@/lib/charm-price";
import { normaliseIndianMobile } from "@/lib/whatsapp";

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
   * How long after delivery a customer may press "Request return", in hours.
   * Enforced: the button goes and the server refuses once it has passed. Also
   * the figure the shipped and delivered emails quote. 0 = no limit.
   *
   * Hours, not days, because the shop's promise is "48 hours with an unboxing
   * video". Separate from returnWindowDays, which is only what Google is told.
   */
  returnRequestHours: number;

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

  /**
   * The header's "By finish" links (Jewellery menu), in display order.
   *
   * Each is a SEARCH, not a filter: `query` runs the same full-text search as
   * the search box, which covers name, description and tags. So a piece
   * appears under "Oxidised" when any of those mention it — tagging is the
   * dependable way. An empty list hides the column, which is the honest
   * state for a catalogue that has not been tagged yet.
   */
  navFinishes: NavFilter[];

  /** The header's "By occasion" links (Gifting menu). Same rules as above. */
  navOccasions: NavFilter[];

  /**
   * The header's "Shop for" links (Jewellery menu): Men, Women, Kids,
   * Devotional and the like.
   *
   * Unlike the two lists above, `query` here is a COLLECTION SLUG, not a
   * search. These are groupings the shop curates — a piece is in "Men" because
   * someone tagged it so, not because the word appears in its description — and
   * a collection is that curation with a proper landing page. A link whose
   * collection is unpublished or deleted is dropped from the menu rather than
   * left pointing at a 404 (see buildNav).
   *
   * Defaults to empty: no such collections exist until the shop makes them.
   */
  navShopFor: NavFilter[];

  /**
   * Round prices as they are saved — ₹1,000 → ₹999 — or "off".
   *
   * Applies to a price the admin TYPES: the product form, a CSV cell that
   * carries a price, and the reduced price an Offer computes. Never to a price
   * nobody touched, so turning this on does not quietly reprice the catalogue —
   * that is what the bulk "Charm prices" action is for, with a preview.
   * Default off, so no price changes without someone choosing it.
   */
  charmPricing: "off" | CharmStyle;

  /**
   * The shop's WhatsApp number, as wa.me wants it ("919876543210"), or "" to
   * hide every WhatsApp link on the site.
   *
   * A setting rather than the NEXT_PUBLIC_WHATSAPP_NUMBER env var it replaces,
   * so the owner can put the business number in — or change it — without a
   * developer and a redeploy. The env var is still the DEFAULT, so a shop that
   * set it before this existed keeps its links until the owner saves a number.
   */
  whatsappNumber: string;

  /**
   * Which courier partners the Ship order dialog asks for prices. Both on means
   * both are compared and the cheapest is preselected; one on means only that
   * partner is used. A partner whose API keys are missing is skipped whatever
   * this says (see server/couriers). At least one stays on — the admin action
   * refuses to save both off.
   */
  courierPartners: { shiprocket: boolean; nimbuspost: boolean };
};

/** The header-menu lists, as one shape — what getNavMenuSettings returns. */
export type NavMenuSettings = Pick<StoreSettings, "navFinishes" | "navOccasions" | "navShopFor">;

/** One editable header-menu link: what a shopper reads, and what it searches. */
export type NavFilter = { label: string; query: string };

/** Hard limits, shared by the parser and the admin action. */
export const NAV_FILTER_LIMITS = { items: 12, label: 40, query: 60 } as const;

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
  /** The shop's stated policy: report within 48 hours with an unboxing video. */
  returnRequestHours: 48,
  handlingTimeMinDays: 0,
  handlingTimeMaxDays: 0,
  transitTimeMinDays: 0,
  transitTimeMaxDays: 0,

  // What the header shipped with when these lists were hardcoded, so a shop
  // that never opens this setting sees no change. Edit or empty them in
  // /admin/settings.
  navFinishes: [
    { label: "Oxidised", query: "oxidised" },
    { label: "Polished", query: "polished" },
    { label: "Matte", query: "matte" },
    { label: "Rhodium plated", query: "rhodium-plated" },
    { label: "Rose gold plated", query: "rose-gold-plated" },
  ],
  navOccasions: [
    { label: "Bridal", query: "bridal" },
    { label: "Festive", query: "festive" },
    { label: "Party", query: "party" },
    { label: "Office", query: "office" },
    { label: "Everyday", query: "everyday" },
  ],
  navShopFor: [],
  charmPricing: "off",
  whatsappNumber: normaliseIndianMobile(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER),
  // Shiprocket only until the owner switches NimbusPost on — so deploying this
  // changes nothing about how parcels are shipped today.
  courierPartners: { shiprocket: true, nimbuspost: false },
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
  /**
   * A header-menu list. Not an array at all means "never saved" and takes the
   * default; an EMPTY array is a deliberate choice to hide the column and is
   * kept. Malformed rows are dropped rather than failing the whole list, and
   * everything is trimmed and capped — these strings end up in every page's
   * header.
   */
  const filters = (x: unknown, fallback: NavFilter[]): NavFilter[] => {
    if (!Array.isArray(x)) return fallback;
    const L = NAV_FILTER_LIMITS;
    return x
      .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
      .map((r) => ({
        label: typeof r.label === "string" ? r.label.trim().slice(0, L.label) : "",
        query: typeof r.query === "string" ? r.query.trim().slice(0, L.query) : "",
      }))
      .filter((r) => r.label && r.query)
      .slice(0, L.items);
  };

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
    returnRequestHours: whole(v.returnRequestHours, d.returnRequestHours),
    returnShippingPaidBy: oneOf(
      v.returnShippingPaidBy,
      ["customer", "merchant"] as const,
      d.returnShippingPaidBy
    ),
    handlingTimeMinDays: whole(v.handlingTimeMinDays, d.handlingTimeMinDays),
    handlingTimeMaxDays: whole(v.handlingTimeMaxDays, d.handlingTimeMaxDays),
    transitTimeMinDays: whole(v.transitTimeMinDays, d.transitTimeMinDays),
    transitTimeMaxDays: whole(v.transitTimeMaxDays, d.transitTimeMaxDays),
    navFinishes: filters(v.navFinishes, d.navFinishes),
    navOccasions: filters(v.navOccasions, d.navOccasions),
    navShopFor: filters(v.navShopFor, d.navShopFor),
    charmPricing: oneOf(v.charmPricing, ["off", "99", "49-99"] as const, d.charmPricing),
    // Never saved → the default; saved empty → deliberately hidden, and kept.
    whatsappNumber:
      typeof v.whatsappNumber === "string" ? normaliseIndianMobile(v.whatsappNumber) : d.whatsappNumber,
    courierPartners: (() => {
      const c = (typeof v.courierPartners === "object" && v.courierPartners !== null
        ? v.courierPartners
        : {}) as Record<string, unknown>;
      const picked = {
        shiprocket: bool(c.shiprocket, d.courierPartners.shiprocket),
        nimbuspost: bool(c.nimbuspost, d.courierPartners.nimbuspost),
      };
      // Both off can't ship anything — treat it as never saved.
      return picked.shiprocket || picked.nimbuspost ? picked : d.courierPartners;
    })(),
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

/** Cache tag for the header-menu lists alone. See getNavMenuSettings. */
export const NAV_MENU_TAG = "settings:nav";

/**
 * Just the header-menu lists, cached under their OWN tag.
 *
 * ⚠️  Not getStoreSettings, deliberately. The header is on every page, so
 * whatever cache tag it reads is attached to every page on the site. Reading
 * the full settings put STORE_SETTINGS_TAG there — and that tag is expired by
 * EVERY settings save, so switching COD off made every page rebuild its
 * header from cold on its next visit. Measured: in the e2e suite, the COD test
 * saves settings and then opens a product page and the checkout, both cold,
 * and ran out of time under parallel load.
 *
 * Under its own tag, which the save expires only when these lists actually
 * change (see saveStoreSettingsAction), a COD or shipping save leaves the
 * header — and so every other page — alone.
 */
export async function getNavMenuSettings(): Promise<NavMenuSettings> {
  try {
    return await readNavMenuSettings();
  } catch (err) {
    // Same reasoning as getStoreSettings: a failed read is per-request, never
    // cached, and never a reason for the header to break.
    console.error("getNavMenuSettings failed — falling back to defaults", err);
    const { navFinishes, navOccasions, navShopFor } = STORE_SETTING_DEFAULTS;
    return { navFinishes, navOccasions, navShopFor };
  }
}

async function readNavMenuSettings(): Promise<NavMenuSettings> {
  "use cache";
  // Long-lived: the save expires it by tag the moment a list changes, so the
  // window only matters for a row edited outside the app.
  cacheLife("days");
  cacheTag(NAV_MENU_TAG);

  const row = await prisma.storeSetting.findUnique({ where: { key: SETTINGS_KEY } });
  const { navFinishes, navOccasions, navShopFor } = parse(row?.value);
  return { navFinishes, navOccasions, navShopFor };
}

/** Cache tag for the WhatsApp number alone. See getContactSettings. */
export const CONTACT_TAG = "settings:contact";

/**
 * Just the shop's WhatsApp number, cached under its OWN tag — for the footer
 * and mobile menu, which are on every page.
 *
 * Same reasoning as getNavMenuSettings: reading the full settings there would
 * attach STORE_SETTINGS_TAG to every page, and every COD or shipping save
 * would rebuild all of them. The save expires this tag only when the number
 * actually changes.
 */
export async function getContactSettings(): Promise<{ whatsappNumber: string }> {
  try {
    return await readContactSettings();
  } catch (err) {
    console.error("getContactSettings failed — falling back to defaults", err);
    return { whatsappNumber: STORE_SETTING_DEFAULTS.whatsappNumber };
  }
}

async function readContactSettings(): Promise<{ whatsappNumber: string }> {
  "use cache";
  cacheLife("days");
  cacheTag(CONTACT_TAG);

  const row = await prisma.storeSetting.findUnique({ where: { key: SETTINGS_KEY } });
  return { whatsappNumber: parse(row?.value).whatsappNumber };
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
