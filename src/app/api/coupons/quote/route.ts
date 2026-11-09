import { z } from "zod";
import { auth } from "@/server/auth/auth";
import { evaluateCoupon, listOffers, CouponError } from "@/server/coupons/coupons";
import { checkIpRateLimit, RATE_LIMIT_MESSAGE } from "@/server/rate-limit/limiter";
import type { CouponQuote } from "@/lib/coupon-quote";

/**
 * The order summary's coupon box in ONE request: the applied code's discount
 * (if a code is given) and the "Available offers" list.
 *
 * ⚠️  A Route Handler, NOT Server Actions, on purpose. Next.js runs a client's
 * Server Actions one at a time, so the preview and the offers list (two
 * actions, re-fired as the cart total or the typed email/mobile changed)
 * queued in front of the shopper's "Pay" — that, plus the pincode check, was
 * the 5+ seconds of "Placing your order". A POST runs alongside everything.
 *
 * Display only. The subtotal comes from the browser, which is fine for a
 * preview; create-order.ts recomputes everything from the database and
 * re-checks the code when the order is placed.
 */
const schema = z.object({
  code: z.string().trim().max(40).optional().or(z.literal("")),
  subtotalPaise: z.number().int().min(0).max(100_000_000),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/).optional().or(z.literal("")),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const body: CouponQuote = { coupon: { ok: false, error: "Please check the code." }, offers: [] };
    return Response.json(body, { status: 400 });
  }
  const { code, subtotalPaise, email, phone } = parsed.data;

  // A quote that checks a code spends the strict `coupon` bucket (guessing
  // codes costs a request per guess); one that only lists offers — refetched
  // as the cart and contact details change — spends the looser `offers` one.
  if (!(await checkIpRateLimit(code ? "coupon" : "offers"))) {
    const body: CouponQuote = {
      coupon: code ? { ok: false, error: RATE_LIMIT_MESSAGE } : null,
      offers: [],
    };
    return Response.json(body, { status: 429 });
  }

  const session = await auth();
  const shopper = {
    userId: session?.user?.id ?? null,
    email: email || session?.user?.email || null,
    phone: phone || null,
  };

  // The two answers are independent, so they are worked out together.
  const [coupon, offers] = await Promise.all([
    code
      ? evaluateCoupon(code, subtotalPaise, shopper).then(
          (r) => ({ ok: true as const, code: r.coupon.code, discountPaise: r.discountPaise }),
          (err) => {
            if (err instanceof CouponError) return { ok: false as const, error: err.message };
            console.error("coupon quote failed", err);
            return { ok: false as const, error: "Couldn't check that code. Please try again." };
          },
        )
      : Promise.resolve(null),
    subtotalPaise > 0
      ? listOffers(subtotalPaise, shopper).catch((err) => {
          // A missing offers panel must never stop a sale.
          console.error("offers list failed", err);
          return [];
        })
      : Promise.resolve([]),
  ]);

  const body: CouponQuote = { coupon, offers };
  return Response.json(body);
}
