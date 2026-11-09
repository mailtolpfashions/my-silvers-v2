"use server";

import { redirect } from "next/navigation";
import { findOrderForTracking, normaliseOrderNumber } from "@/server/orders/track";
import {
  checkIpRateLimit,
  checkRateLimit,
  RATE_LIMIT_MESSAGE,
} from "@/server/rate-limit/limiter";

export type TrackOrderState =
  | {
      error?: string;
      notFound?: boolean;
      signInHref?: string;
      /** Echoed back: React resets a form after its action runs, and a
       *  shopper who mistyped one field should not have to retype both. */
      values: { orderNumber: string; contact: string };
    }
  | undefined;

/** One message for every miss — see the note in server/orders/track.ts. */
const NOT_FOUND =
  "We couldn't find an order with those details. Please check your order number and the email or mobile number you used at checkout.";

export async function trackOrderAction(
  _prev: TrackOrderState,
  formData: FormData,
): Promise<TrackOrderState> {
  const orderNumber = String(formData.get("orderNumber") ?? "").slice(0, 40);
  const contact = String(formData.get("contact") ?? "").slice(0, 200);
  const values = { orderNumber, contact };

  if (!orderNumber.trim() || !contact.trim()) {
    return { values, error: "Please enter your order number and your email or mobile number." };
  }

  if (!(await checkIpRateLimit("trackOrderIp"))) return { values, error: RATE_LIMIT_MESSAGE };
  // Keyed by the canonical number, so "mys-123" and "MYS-000123" share a bucket.
  const key = normaliseOrderNumber(orderNumber) ?? orderNumber.trim().toUpperCase();
  if (!(await checkRateLimit("trackOrder", key))) return { values, error: RATE_LIMIT_MESSAGE };

  const found = await findOrderForTracking(orderNumber, contact);
  if (!found) return { values, error: NOT_FOUND, notFound: true };

  if (found.kind === "guest") {
    redirect(`/orders/${found.orderId}?ot=${found.token}`);
  }
  // Placed from an account — its details stay behind that account's sign-in.
  // Said on the form rather than by bouncing to /login, which would arrive
  // with no explanation of why a lookup turned into a sign-in page.
  return {
    values,
    signInHref: `/login?redirect=${encodeURIComponent(`/account/orders/${found.orderId}`)}`,
  };
}
