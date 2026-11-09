import type { NextRequest } from "next/server";
import { checkServiceabilityCached, ShiprocketError } from "@/server/integrations/shiprocket";
import { checkIpRateLimit } from "@/server/rate-limit/limiter";
import type { PincodeCheck } from "@/lib/pincode-check";

/**
 * The checkout's "Delivers in about N days" check.
 *
 * ⚠️  A Route Handler, NOT a Server Action, on purpose. Next.js runs a
 * client's Server Actions one at a time, so when this was an action the
 * shopper's "Pay" (placeOrderAction) queued behind a Shiprocket round trip,
 * and behind the coupon and offers checks — several seconds of "Placing your
 * order" for nothing. A plain GET runs alongside everything else.
 *
 * Read-only and safe to call repeatedly; answers are cached per pincode for
 * six hours (checkServiceabilityCached). Rate limited like the action was.
 */
const NOMINAL_WEIGHT_KG = 0.5;

export async function GET(req: NextRequest) {
  const pincode = req.nextUrl.searchParams.get("pincode") ?? "";
  const cod = req.nextUrl.searchParams.get("cod") === "1";
  const unknown: PincodeCheck = { status: "unknown" };

  if (!/^\d{6}$/.test(pincode)) return Response.json(unknown);
  if (!(await checkIpRateLimit("pincode"))) return Response.json(unknown);

  try {
    const result = await checkServiceabilityCached({
      deliveryPincode: pincode,
      weightKg: NOMINAL_WEIGHT_KG,
      cod,
    });
    const body: PincodeCheck = result.serviceable
      ? { status: "serviceable", estimatedDays: result.estimatedDays }
      : { status: "unserviceable" };
    return Response.json(body);
  } catch (err) {
    // Logged, not surfaced. A missing SHIPROCKET_PICKUP_PINCODE looks identical
    // to an outage from the shopper's side, and neither is their problem.
    if (err instanceof ShiprocketError) console.error("[shiprocket] serviceability lookup failed:", err.message);
    else console.error("pincode check failed", err);
    return Response.json(unknown);
  }
}
