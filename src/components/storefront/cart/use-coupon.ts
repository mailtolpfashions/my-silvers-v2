"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
// A fetch, not Server Actions — see app/api/coupons/quote/route.ts.
import { fetchCouponQuote } from "@/lib/coupon-quote";
import type { Offer } from "@/server/coupons/coupons";

/**
 * The applied coupon code, shared by the cart and checkout.
 *
 * Only the CODE is remembered (localStorage), never the discount: the amount
 * is re-asked of the server whenever the cart total or the shopper's contact
 * details change, so a stale number can never be shown — and the order itself
 * is re-checked again when it is placed.
 */
const KEY = "mys-coupon";
const EVENT = "coupon-changed";

function read(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

function write(code: string) {
  try {
    if (code) window.localStorage.setItem(KEY, code);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Private mode and the like — the coupon simply isn't remembered.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Forget the code — after an order is placed with it. */
export function clearAppliedCoupon() {
  write("");
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export type CouponState = {
  /** The code applied right now ("" when none). */
  code: string;
  /** What it takes off this cart, in paise; 0 while checking or when invalid. */
  discountPaise: number;
  /** Why the remembered code does not apply (shown under the box). */
  error: string | null;
  pending: boolean;
  apply: (code: string) => Promise<boolean>;
  remove: () => void;
  /** The shop's listed coupons for this cart — see listOffers. */
  offers: Offer[];
};

type Quote = { key: string; discountPaise: number; error: string | null; offers: Offer[] };

export function useCoupon(
  subtotalPaise: number,
  contact?: { email?: string; phone?: string },
): CouponState {
  const code = useSyncExternalStore(subscribe, read, () => "");
  const [quote, setQuote] = useState<Quote | null>(null);
  // Offers survive a refetch, so the panel does not flicker empty on every
  // quantity change; the discount does not — a stale number must never show.
  const [offers, setOffers] = useState<Offer[]>([]);

  // Only contact details complete enough to mean something — half a phone
  // number would just produce a false "first orders only".
  const email = contact?.email && /\S+@\S+\.\S+/.test(contact.email) ? contact.email : "";
  const phone = contact?.phone && /^[6-9]\d{9}$/.test(contact.phone) ? contact.phone : "";
  const key = `${code}|${subtotalPaise}|${email}|${phone}`;

  /**
   * One request answers both the applied code and the offers list, refetched
   * whenever the code, the cart total or the contact details change. Debounced
   * for typing — except right after Apply, which the shopper is waiting on.
   */
  const immediate = useRef(false);
  const waiters = useRef(new Map<string, (ok: boolean) => void>());

  useEffect(() => {
    if (subtotalPaise <= 0) return;
    if (quote?.key === key) return;
    const controller = new AbortController();
    const delay = immediate.current ? 0 : 300;
    immediate.current = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetchCouponQuote({
          code: code || undefined,
          subtotalPaise,
          email,
          phone,
          signal: controller.signal,
        });
        const ok = !!res.coupon?.ok;
        setQuote({
          key,
          discountPaise: res.coupon?.ok ? res.coupon.discountPaise : 0,
          error: res.coupon && !res.coupon.ok ? res.coupon.error : null,
          offers: res.offers,
        });
        setOffers(res.offers);
        waiters.current.get(key)?.(ok);
        waiters.current.delete(key);
      } catch {
        // Aborted: a newer question replaced this one.
      }
    }, delay);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [key, code, subtotalPaise, email, phone, quote?.key]);

  /** Applies a code; resolves true once the server says it applies. */
  const apply = useCallback(
    (raw: string) => {
      const c = raw.trim().toUpperCase().replace(/\s+/g, "");
      if (!c) return Promise.resolve(false);
      const nextKey = `${c}|${subtotalPaise}|${email}|${phone}`;
      return new Promise<boolean>((resolve) => {
        waiters.current.get(nextKey)?.(false);
        waiters.current.set(nextKey, resolve);
        immediate.current = true;
        write(c);
        // Same code applied again (e.g. after an error): force a re-ask.
        if (c === code) setQuote(null);
      });
    },
    [subtotalPaise, email, phone, code],
  );

  const remove = useCallback(() => {
    write("");
  }, []);

  const current = quote?.key === key ? quote : null;
  return {
    offers: subtotalPaise > 0 ? (current?.offers ?? offers) : [],
    code,
    discountPaise: code ? (current?.discountPaise ?? 0) : 0,
    error: code ? (current?.error ?? null) : null,
    pending: !!code && !current,
    apply,
    remove,
  };
}
