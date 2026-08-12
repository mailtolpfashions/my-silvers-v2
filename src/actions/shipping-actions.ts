"use server";

import { checkServiceability, ShiprocketError } from "@/server/integrations/shiprocket";
import { checkRateLimit, getClientIp } from "@/server/rate-limit/limiter";

export type PincodeCheck =
  | { status: "serviceable"; estimatedDays: number | null }
  | { status: "unserviceable" }
  /**
   * Shiprocket is unreachable, rate-limited, or misconfigured. Deliberately its
   * own case rather than folding into "unserviceable": the checkout must not
   * refuse an order because a courier API is having a bad afternoon, so the UI
   * treats this as "carry on" and simply says nothing.
   */
  | { status: "unknown" };

/**
 * Nominal parcel weight for the lookup, in kg.
 *
 * The cart's real weight is not used, on purpose. Serviceability at this scale
 * is a question about the PINCODE — whether any courier reaches it at all —
 * and the answer does not change between a ring and a necklace. Passing a real
 * weight would make the result depend on the cart, so a shopper could be told
 * "we deliver here" and then, after adding a second item, "we do not". 0.5kg is
 * the same courier minimum the shipment code floors to.
 */
const NOMINAL_WEIGHT_KG = 0.5;

/**
 * Can we deliver to this pincode, and roughly how fast.
 *
 * Called from checkout as the shopper types, so that an unserviceable pincode
 * is caught BEFORE payment rather than discovered afterwards by an admin who
 * then has to refund it.
 */
export async function checkPincodeAction(
  pincode: string,
  cod: boolean
): Promise<PincodeCheck> {
  if (!/^\d{6}$/.test(pincode)) return { status: "unknown" };

  if (!(await checkRateLimit("pincode", await getClientIp()))) {
    return { status: "unknown" };
  }

  try {
    const result = await checkServiceability({
      deliveryPincode: pincode,
      weightKg: NOMINAL_WEIGHT_KG,
      cod,
    });
    return result.serviceable
      ? { status: "serviceable", estimatedDays: result.estimatedDays }
      : { status: "unserviceable" };
  } catch (err) {
    // Logged, not surfaced. A missing SHIPROCKET_PICKUP_PINCODE looks identical
    // to an outage from the shopper's side, and neither is their problem.
    if (!(err instanceof ShiprocketError)) console.error("checkPincodeAction failed", err);
    else console.error("[shiprocket] serviceability lookup failed:", err.message);
    return { status: "unknown" };
  }
}
