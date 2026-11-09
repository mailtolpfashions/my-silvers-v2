"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/server/auth/auth";
import { claimGuestAccount, GuestAccountError } from "@/server/orders/guest-account";
import { checkIpRateLimit, RATE_LIMIT_MESSAGE } from "@/server/rate-limit/limiter";
import { sendEmailConfirmation } from "@/server/auth/email-verification";

/** Returns an error message, or nothing — success redirects. */
export async function saveOrderToAccountAction(
  _prev: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  if (!(await checkIpRateLimit("auth"))) return RATE_LIMIT_MESSAGE;

  const orderId = String(formData.get("orderId") ?? "");
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");

  if (password.length < 8) return "Password must be at least 8 characters.";

  let email: string;
  try {
    email = await claimGuestAccount(orderId, token, password);
  } catch (error) {
    if (error instanceof GuestAccountError) {
      return "We couldn't set up an account for this order. Please sign in or register instead.";
    }
    throw error;
  }

  // The order link proves possession of this ORDER, not of the inbox, so the
  // account starts unconfirmed: its guest orders (this one included) stay out
  // of /account until the emailed link is clicked. Hence the redirect back to
  // the order's own page rather than /account/orders/…, which would 404.
  await sendEmailConfirmation({ email });

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: `/orders/${orderId}?ot=${token}`,
    });
  } catch (error) {
    // signIn redirects by throwing; only a real AuthError is a failure.
    if (error instanceof AuthError) return "Account created — please sign in.";
    throw error;
  }
  return undefined;
}
