"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { previewCouponAction, listOffersAction } from "@/actions/coupon-actions";
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

export function useCoupon(
  subtotalPaise: number,
  contact?: { email?: string; phone?: string },
): CouponState {
  const code = useSyncExternalStore(subscribe, read, () => "");
  const [result, setResult] = useState<{ key: string; discountPaise: number; error: string | null } | null>(null);
  const [pending, setPending] = useState(false);
  const seq = useRef(0);

  // Only contact details that are complete enough to mean something — half a
  // phone number would just produce a false "first orders only".
  const email = contact?.email && /\S+@\S+\.\S+/.test(contact.email) ? contact.email : "";
  const phone = contact?.phone && /^[6-9]\d{9}$/.test(contact.phone) ? contact.phone : "";
  const key = `${code}|${subtotalPaise}|${email}|${phone}`;

  const check = useCallback(
    async (c: string) => {
      const mine = ++seq.current;
      setPending(true);
      const res = await previewCouponAction({ code: c, subtotalPaise, email, phone }).catch(() => ({
        ok: false as const,
        error: "Couldn't check that code. Please try again.",
      }));
      if (mine !== seq.current) return res.ok; // a newer check superseded this one
      setPending(false);
      setResult({
        key: `${res.ok ? res.code : c}|${subtotalPaise}|${email}|${phone}`,
        discountPaise: res.ok ? res.discountPaise : 0,
        error: res.ok ? null : res.error,
      });
      return res.ok;
    },
    [subtotalPaise, email, phone],
  );

  // Re-check the remembered code whenever the cart or contact changes.
  useEffect(() => {
    if (!code || subtotalPaise <= 0) return;
    if (result?.key === key) return;
    const t = setTimeout(() => void check(code), 300);
    return () => clearTimeout(t);
  }, [code, key, subtotalPaise, result?.key, check]);

  const apply = useCallback(
    async (raw: string) => {
      const c = raw.trim().toUpperCase().replace(/\s+/g, "");
      if (!c) return false;
      write(c);
      return check(c);
    },
    [check],
  );

  const remove = useCallback(() => {
    seq.current++;
    setResult(null);
    setPending(false);
    write("");
  }, []);

  /**
   * The offers list, refetched when the cart total or the contact details
   * change — a bigger cart can unlock an offer, and a mobile number typed at
   * checkout can rule out a first-order one. Debounced like the check above.
   */
  const offersKey = `${subtotalPaise}|${email}|${phone}`;
  const [offers, setOffers] = useState<{ key: string; list: Offer[] }>({ key: "", list: [] });
  useEffect(() => {
    if (subtotalPaise <= 0) return;
    let alive = true;
    const t = setTimeout(() => {
      listOffersAction({ subtotalPaise, email, phone })
        .then((list) => alive && setOffers({ key: offersKey, list }))
        .catch(() => {});
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [offersKey, subtotalPaise, email, phone]);

  const current = code && result?.key === key ? result : null;
  return {
    // The last list fetched, even while a newer one loads, so the panel does
    // not flicker empty on every quantity change.
    offers: subtotalPaise > 0 ? offers.list : [],
    code,
    discountPaise: current?.discountPaise ?? 0,
    error: current?.error ?? null,
    pending: !!code && (pending || !current),
    apply,
    remove,
  };
}
