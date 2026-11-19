/**
 * Courier text as shoppers should read it.
 *
 * Couriers send their own internal spellings — "shipped", "booked",
 * "delhivery", "Uthangarai_Singarapettai_D" — and the order page showed them
 * verbatim (owner's screenshot, Nov 2026). Display only: what is stored, and
 * what tracking logic compares against, is untouched.
 */

/** "shipped" → "Shipped", "IN TRANSIT" → "In transit", "Pickup scheduled" stays. */
export function scanActivity(raw: string): string {
  const text = raw.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return text;
  // Shouting or all-lowercase → sentence case; anything already mixed is the
  // courier's own wording and is left alone apart from the first letter.
  const normalised = text === text.toUpperCase() || text === text.toLowerCase() ? text.toLowerCase() : text;
  return normalised.charAt(0).toUpperCase() + normalised.slice(1);
}

/**
 * "Uthangarai_Singarapettai_D" → "Uthangarai Singarapettai".
 * Couriers name hubs with underscores and a trailing facility code (D, DC,
 * PC…); the code means nothing to a shopper. A trailing "(Tamil Nadu)" kept.
 */
export function scanLocation(raw: string): string {
  const match = raw.match(/^(.*?)(\s*\([^)]*\))?$/);
  const place = (match?.[1] ?? raw).replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const suffix = match?.[2]?.trim() ?? "";
  const words = place.split(" ");
  if (words.length > 1 && /^[A-Z]{1,3}$/.test(words[words.length - 1])) words.pop();
  return [words.join(" "), suffix].filter(Boolean).join(" ");
}

const COURIER_NAMES: Record<string, string> = {
  delhivery: "Delhivery",
  bluedart: "Blue Dart",
  "blue dart": "Blue Dart",
  dtdc: "DTDC",
  xpressbees: "Xpressbees",
  ekart: "Ekart",
  "ecom express": "Ecom Express",
  ecomexpress: "Ecom Express",
  shadowfax: "Shadowfax",
  "india post": "India Post",
  indiapost: "India Post",
  amazon: "Amazon Shipping",
  "amazon shipping": "Amazon Shipping",
  gati: "Gati",
  shiprocket: "Shiprocket",
  nimbuspost: "NimbusPost",
};

/** "delhivery" → "Delhivery", "delhivery surface" → "Delhivery Surface". */
export function courierLabel(raw: string): string {
  const key = raw.trim().toLowerCase();
  if (COURIER_NAMES[key]) return COURIER_NAMES[key];
  // A known brand followed by a service ("delhivery surface 5kg").
  for (const [name, label] of Object.entries(COURIER_NAMES)) {
    if (key.startsWith(`${name} `)) {
      const rest = raw.trim().slice(name.length).trim();
      return `${label} ${rest.charAt(0).toUpperCase()}${rest.slice(1)}`;
    }
  }
  // Unknown: capitalise each word only if the courier sent it all-lowercase.
  return raw === raw.toLowerCase() ? raw.replace(/\b\w/g, (c) => c.toUpperCase()) : raw;
}

/** Does this courier status or scan mean the parcel is out for delivery today? */
export function isOutForDelivery(text: string): boolean {
  return /out\s*for\s*deliver/i.test(text.replace(/_/g, " "));
}
