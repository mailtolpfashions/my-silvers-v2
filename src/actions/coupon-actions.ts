"use server";

import { z } from "zod";
import { auth } from "@/server/auth/auth";
import { evaluateCoupon, CouponError } from "@/server/coupons/coupons";
import { checkIpRateLimit, RATE_LIMIT_MESSAGE } from "@/server/rate-limit/limiter";

const schema = z.object({
  code: z.string().trim().min(1, "Please enter a coupon code.").max(40),
  /** Product subtotal the shopper is looking at, in paise. */
  subtotalPaise: z.number().int().min(0).max(100_000_000),
  /** Known at checkout, not on the cart page. */
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/).optional().or(z.literal("")),
});

export type CouponPreview =
  | { ok: true; code: string; discountPaise: number }
  | { ok: false; error: string };

/**
 * A PREVIEW of what a code is worth on this cart — for the summary block only.
 *
 * The subtotal comes from the browser, which is acceptable for a preview and
 * would not be for a charge: create-order.ts recomputes everything from the
 * database and re-checks the code with the email and mobile actually used.
 */
export async function previewCouponAction(input: unknown): Promise<CouponPreview> {
  if (!(await checkIpRateLimit("coupon"))) return { ok: false, error: RATE_LIMIT_MESSAGE };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the code." };
  }
  const { code, subtotalPaise, email, phone } = parsed.data;
  const session = await auth();

  try {
    const result = await evaluateCoupon(code, subtotalPaise, {
      userId: session?.user?.id ?? null,
      email: email || session?.user?.email || null,
      phone: phone || null,
    });
    return { ok: true, code: result.coupon.code, discountPaise: result.discountPaise };
  } catch (err) {
    if (err instanceof CouponError) return { ok: false, error: err.message };
    console.error("previewCouponAction failed", err);
    return { ok: false, error: "Couldn't check that code. Please try again." };
  }
}
