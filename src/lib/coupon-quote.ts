import type { Offer } from "@/server/coupons/coupons";

/** What /api/coupons/quote answers — see that route. */
export type CouponQuote = {
  /** null when no code was asked about. */
  coupon: { ok: true; code: string; discountPaise: number } | { ok: false; error: string } | null;
  offers: Offer[];
};

export async function fetchCouponQuote(input: {
  code?: string;
  subtotalPaise: number;
  email?: string;
  phone?: string;
  signal?: AbortSignal;
}): Promise<CouponQuote> {
  const { signal, ...body } = input;
  try {
    const res = await fetch("/api/coupons/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    return (await res.json()) as CouponQuote;
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    return {
      coupon: input.code ? { ok: false, error: "Couldn't check that code. Please try again." } : null,
      offers: [],
    };
  }
}
