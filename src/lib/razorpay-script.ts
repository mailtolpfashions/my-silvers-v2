"use client";

/**
 * Waits for Razorpay's Checkout.js instead of giving up the moment it is
 * missing.
 *
 * The pages still preload it with <Script strategy="afterInteractive">, so on a
 * normal connection it is there long before anyone presses Pay and this
 * resolves at once. What this covers is the tap that comes first — a slow
 * mobile connection, or a download that failed once. Before, both showed
 * "Payment gateway failed to load" and the only way out was a refresh.
 *
 * Two stages:
 *   1. Give the preloaded script a few seconds to arrive.
 *   2. Still missing — add a fresh script tag (the first download may have
 *      failed outright, and a failed <script> never retries itself) and wait
 *      for that one.
 *
 * Resolves true when window.Razorpay exists, false when it still doesn't.
 * Never rejects, so callers only branch on the boolean.
 */

const SRC = "https://checkout.razorpay.com/v1/checkout.js";
const PRELOAD_WAIT_MS = 5_000;
const RETRY_WAIT_MS = 8_000;
const POLL_MS = 100;

/** Shared across callers so two quick taps don't add two retry tags. */
let inFlight: Promise<boolean> | null = null;

function ready(): boolean {
  return typeof window !== "undefined" && typeof window.Razorpay === "function";
}

function waitForGlobal(ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (ready()) return resolve(true);
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (ready()) {
        window.clearInterval(timer);
        resolve(true);
      } else if (Date.now() - started >= ms) {
        window.clearInterval(timer);
        resolve(false);
      }
    }, POLL_MS);
  });
}

function injectAndWait(ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = SRC;
    script.async = true;
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(ok);
    };
    const timeout = window.setTimeout(() => finish(ready()), ms);
    script.onload = () => finish(ready());
    script.onerror = () => finish(false);
    document.head.appendChild(script);
  });
}

export function loadRazorpay(): Promise<boolean> {
  if (ready()) return Promise.resolve(true);
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      if (await waitForGlobal(PRELOAD_WAIT_MS)) return true;
      return await injectAndWait(RETRY_WAIT_MS);
    } finally {
      // A failure must not stick: the next tap gets a fresh attempt.
      inFlight = null;
    }
  })();
  return inFlight;
}

/** One wording for both pay buttons. */
export const GATEWAY_UNAVAILABLE =
  "We couldn't open the payment window. Please check your internet connection and try again.";
