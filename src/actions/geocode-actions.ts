"use server";

import {
  GeocodingError,
  reverseGeocode,
  isGeocodingConfigured,
} from "@/server/integrations/geocoding";
import { checkIpRateLimit } from "@/server/rate-limit/limiter";

export type LocationLookup =
  | {
      status: "ok";
      city: string | null;
      state: string | null;
      pincode: string | null;
    }
  | { status: "outside-india" }
  | { status: "no-address" }
  /**
   * Provider down, misconfigured, or we refused the request ourselves. One case
   * for all of them because the shopper's next step is identical in every
   * one — type the address — and "which upstream failed" is our problem, not
   * something to put on a checkout screen.
   */
  | { status: "unavailable" };

/**
 * Turn the browser's coordinates into a delivery address.
 *
 * The browser is trusted for nothing here beyond two numbers. It cannot name a
 * provider, cannot pass a key, and cannot ask for anything except the address
 * at a point — so the worst an abusive caller gets is a rate-limited lookup on
 * coordinates they already had.
 */
export async function reverseGeocodeAction(
  latitude: unknown,
  longitude: unknown
): Promise<LocationLookup> {
  if (!isGeocodingConfigured()) return { status: "unavailable" };

  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return { status: "unavailable" };
  }

  // Before the provider call, not after — the point of the limit is to not
  // spend the metered request.
  if (!(await checkIpRateLimit("geocode"))) return { status: "unavailable" };

  try {
    const result = await reverseGeocode(latitude, longitude);
    return result;
  } catch (err) {
    // Logged, never surfaced. A missing key and a Google outage look identical
    // from the shopper's side, and neither is theirs to fix.
    if (err instanceof GeocodingError) console.error("[geocoding] lookup failed:", err.message);
    else console.error("reverseGeocodeAction failed", err);
    return { status: "unavailable" };
  }
}
