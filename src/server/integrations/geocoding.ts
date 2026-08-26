import { INDIAN_STATES } from "@/lib/validation/account";

/**
 * Reverse geocoding — coordinates to a delivery address.
 *
 * Used by the "Use my current location" button at checkout. The browser gets
 * coordinates from navigator.geolocation and posts them to us; THIS runs on the
 * server and calls the provider. The API key never reaches the browser.
 *
 * That split is the whole security design, and it is not optional. A Maps key
 * shipped in client JavaScript gets scraped and spent by strangers — it is one
 * of the more commonly harvested credentials there is. Keeping the call here
 * also means our own rate limiter bounds it (see the `geocode` tier) and that
 * the browser contacts no third-party origin, so next.config.ts's CSP needs no
 * new entries at all.
 *
 * ── Swapping providers ───────────────────────────────────────────────────────
 * Everything Google-specific is below the GOOGLE banner. To move to Mappls or
 * OlaMaps, write another function returning ReverseGeocodeResult and change
 * which one `reverseGeocode` calls. Nothing outside this file should learn the
 * provider's name.
 */

export class GeocodingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeocodingError";
  }
}

export type ReverseGeocodeResult =
  | {
      status: "ok";
      /** Any of these may be absent — the provider does not always know them. */
      city: string | null;
      /** Guaranteed to be one of INDIAN_STATES, or null. Never a raw provider string. */
      state: string | null;
      pincode: string | null;
    }
  /**
   * The coordinates resolved to somewhere outside India. Its own case rather
   * than an error, because the shopper is not wrong — they may be travelling —
   * and the UI should say something specific instead of quietly filling a
   * Chennai address or claiming a failure.
   */
  | { status: "outside-india" }
  /** No address at open sea, in a desert, or when the provider simply has none. */
  | { status: "no-address" };

/** Whether a key is present. The button is not rendered without one. */
export function isGeocodingConfigured(): boolean {
  return (process.env.GOOGLE_MAPS_API_KEY ?? "").length > 20;
}

/**
 * How long to wait on the provider.
 *
 * Short on purpose. This sits between a shopper tapping a button and the form
 * filling in, so a slow answer is worse than no answer — they can always type
 * the address themselves, which is what they were about to do anyway.
 */
const TIMEOUT_MS = 6_000;

export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<ReverseGeocodeResult> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new GeocodingError("Coordinates are not finite numbers.");
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new GeocodingError("Coordinates are out of range.");
  }
  return googleReverseGeocode(latitude, longitude);
}

// ─── GOOGLE ──────────────────────────────────────────────────────────────────

const GOOGLE_ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";

type GoogleComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

type GoogleResponse = {
  status: string;
  error_message?: string;
  results?: Array<{ address_components?: GoogleComponent[] }>;
};

async function googleReverseGeocode(
  latitude: number,
  longitude: number
): Promise<ReverseGeocodeResult> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  // Distinguished from a rejected key, because the fixes are different: this
  // one means the process started before .env was filled in, or the deployment
  // is missing the variable.
  if (!key) {
    throw new GeocodingError(
      "GOOGLE_MAPS_API_KEY is missing from this environment — if you have just edited .env, restart the server."
    );
  }

  const url = new URL(GOOGLE_ENDPOINT);
  url.searchParams.set("latlng", `${latitude},${longitude}`);
  url.searchParams.set("key", key);
  // English names, so the state matching below has one spelling to deal with
  // rather than one per Indian language.
  url.searchParams.set("language", "en");

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Coordinates differ per shopper and the answer is per-request; there is
      // nothing here worth a cache entry.
      cache: "no-store",
    });
  } catch (err) {
    throw new GeocodingError(
      err instanceof Error && err.name === "TimeoutError"
        ? "The geocoding provider did not answer in time."
        : "Could not reach the geocoding provider."
    );
  }

  if (!response.ok) {
    throw new GeocodingError(`Geocoding provider returned HTTP ${response.status}.`);
  }

  const body = (await response.json()) as GoogleResponse;

  /**
   * ZERO_RESULTS is a real answer, not a failure — the coordinates are valid
   * and Google simply has no address there. Everything else is our problem:
   * REQUEST_DENIED usually means the key is wrong or the Geocoding API is not
   * enabled on the project, OVER_QUERY_LIMIT means the quota cap has been hit.
   * They are logged with Google's own message because those three are
   * distinguishable only by it.
   */
  if (body.status === "ZERO_RESULTS") return { status: "no-address" };
  if (body.status !== "OK") {
    throw new GeocodingError(
      `Geocoding provider said ${body.status}${body.error_message ? `: ${body.error_message}` : ""}`
    );
  }

  const results = body.results ?? [];
  if (results.length === 0) return { status: "no-address" };

  /**
   * Scan across ALL results rather than trusting the first.
   *
   * Google orders them most-specific first, and the most specific one is often
   * a building that carries no postal code while the neighbourhood result three
   * rows down does. Taking the first non-empty value for each field
   * independently gets a complete address where reading a single result gets a
   * half-filled form.
   */
  const pick = (...types: string[]): string | null => {
    for (const result of results) {
      for (const component of result.address_components ?? []) {
        if (types.some((t) => component.types.includes(t))) return component.long_name;
      }
    }
    return null;
  };

  // `short_name` for the country because it is the stable two-letter code;
  // long_name varies ("India" vs "Republic of India") across responses.
  const country = (() => {
    for (const result of results) {
      for (const component of result.address_components ?? []) {
        if (component.types.includes("country")) return component.short_name;
      }
    }
    return null;
  })();

  if (country && country !== "IN") return { status: "outside-india" };

  /**
   * City, in descending order of what a courier actually wants.
   *
   * `locality` is the town or city proper and is right most of the time. It is
   * frequently ABSENT outside large cities, though, which is exactly where a
   * shopper most needs the field filled — so the fallbacks walk outward:
   * sub-district, then district. `administrative_area_level_2` is the district
   * and is the last useful stop; anything broader is the state, which has its
   * own field.
   */
  const city = pick(
    "locality",
    "postal_town",
    "administrative_area_level_3",
    "administrative_area_level_2"
  );

  const rawState = pick("administrative_area_level_1");
  const pincode = pick("postal_code");

  return {
    status: "ok",
    city,
    state: rawState ? normaliseState(rawState) : null,
    // Trust nothing: a provider's postal code still has to look like an Indian
    // one before it goes near a field the order schema validates.
    pincode: pincode && /^[1-9]\d{5}$/.test(pincode.trim()) ? pincode.trim() : null,
  };
}

// ─── STATE NAMES ─────────────────────────────────────────────────────────────

/**
 * Provider spellings that are not ours.
 *
 * ⚠️  This matters more than it looks. The state field is a <select> whose
 * options are exactly INDIAN_STATES, so a value that does not match one of
 * those strings EXACTLY does not select anything — the dropdown silently stays
 * on "Select your state" and the shopper is left wondering why the button half
 * worked. Silent, not loud, which is why it needs a table rather than hope.
 *
 * Geocoders lag renames by years and disagree with each other: Odisha has been
 * Odisha since 2011 and still comes back as Orissa, Puducherry likewise as
 * Pondicherry. Delhi arrives with its full constitutional name. Keys are
 * lowercased and stripped of punctuation before lookup, so only genuinely
 * different WORDS need an entry here — "Jammu & Kashmir" already matches
 * "Jammu and Kashmir" through normalisation.
 */
const STATE_ALIASES: Record<string, string> = {
  "national capital territory of delhi": "Delhi",
  "nct of delhi": "Delhi",
  "new delhi": "Delhi",
  pondicherry: "Puducherry",
  orissa: "Odisha",
  uttaranchal: "Uttarakhand",
  "andaman and nicobar": "Andaman and Nicobar Islands",
  // The two UTs merged in 2020; geocoders still return either half separately.
  "dadra and nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
  "daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
};

/** Lowercase, `&` to `and`, and drop anything that is not a letter or a space. */
function canonical(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CANONICAL_STATES = new Map(INDIAN_STATES.map((s) => [canonical(s), s]));

/**
 * A provider's state string as one of ours, or null.
 *
 * Null rather than a guess. An unrecognised state leaves the dropdown untouched
 * for the shopper to set, which is a small annoyance; guessing wrong ships a
 * parcel to the wrong state, which is not.
 */
function normaliseState(raw: string): string | null {
  const key = canonical(raw);
  const alias = STATE_ALIASES[key];
  if (alias) return alias;
  return CANONICAL_STATES.get(key) ?? null;
}
