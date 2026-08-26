import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";

/**
 * Upstash-backed sliding-window rate limiting — correct across all serverless
 * instances, unlike the old site's in-memory express-rate-limit which
 * fragmented per instance. Tiers mirror the old site's
 * by-endpoint-sensitivity philosophy.
 *
 * When the Upstash env vars are absent or still placeholders, behaviour splits
 * by environment: outside production it degrades to a no-op (one boot-time
 * warning) so local dev works without Redis; in production it fails closed.
 * See the note on checkRateLimit for why the two differ.
 */

function isConfigured(): boolean {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? "";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
  return url.startsWith("https://") && !url.includes("xxxxxxxxxxxx") && token.length > 20;
}

let redis: Redis | null = null;
let warned = false;

function getRedis(): Redis | null {
  if (!isConfigured()) {
    if (!warned) {
      // Three states, not two: production refuses, production-with-the-opt-out
      // allows, and everything else allows. Saying "will be REFUSED" when
      // RATE_LIMIT_FAIL_OPEN is set sends whoever reads the log looking for a
      // problem that is not there — which is exactly what it did during the
      // audit's own test runs.
      const state =
        process.env.NODE_ENV !== "production"
          ? "rate limiting is DISABLED (non-production)."
          : failOpenOptOut()
            ? "rate limiting is DISABLED — RATE_LIMIT_FAIL_OPEN is set. Never set that on the live shop."
            : "rate-limited routes will be REFUSED until UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set.";
      console.warn(`[rate-limit] Upstash not configured — ${state}`);
      warned = true;
    }
    return null;
  }
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return redis;
}

type Tier = {
  tokens: number;
  window: `${number} s` | `${number} m` | `${number} h`;
  prefix: string;
};

// Tightest → loosest, mirroring the old site's tiers.
export const TIERS = {
  auth: { tokens: 5, window: "15 m", prefix: "rl:auth" },
  paymentVerify: { tokens: 5, window: "15 m", prefix: "rl:payverify" },
  guestOrder: { tokens: 3, window: "30 m", prefix: "rl:guestorder" },
  order: { tokens: 10, window: "15 m", prefix: "rl:order" },
  orderOps: { tokens: 15, window: "15 m", prefix: "rl:orderops" },
  webhook: { tokens: 10, window: "1 m", prefix: "rl:webhook" },
  /**
   * Courier tracking, which is a different shape of traffic from payments.
   *
   * Razorpay's `webhook` tier is 10/min because a payment webhook fires a
   * handful of times per ORDER. Shiprocket fires once per SCAN, across every
   * live shipment at once, all from its own small set of IPs — so the same
   * ceiling silently drops tracking updates as soon as more than a few parcels
   * are moving. 120/min is generous for a catalogue this size and still bounds
   * an unauthenticated endpoint; the route drops anything it cannot match to a
   * known AWB regardless.
   */
  shiprocketWebhook: { tokens: 120, window: "1 m", prefix: "rl:srwebhook" },
  // Looser than the order tiers because it fires while someone is typing their
  // pincode, but still capped: it is an unauthenticated hop to a paid upstream.
  pincode: { tokens: 20, window: "5 m", prefix: "rl:pincode" },
  newsletter: { tokens: 3, window: "15 m", prefix: "rl:newsletter" },
  review: { tokens: 5, window: "15 m", prefix: "rl:review" },
  /**
   * Cloudinary upload signatures for customer review media.
   *
   * Looser than `review` on purpose — one review can carry five uploads (four
   * photos and a clip), each of which asks for its own signature, so a tier as
   * tight as the review tier would refuse a shopper halfway through their own
   * first attempt. 40 still bounds what one account can push into the reviews
   * folder, and every signature it hands out is folder- and format-locked.
   */
  uploadSign: { tokens: 40, window: "15 m", prefix: "rl:uploadsign" },
} as const satisfies Record<string, Tier>;

/**
 * The one way to run a production build without rate limiting.
 *
 * The asymmetry is the point: FORGETTING to configure Upstash fails closed,
 * while running without it requires setting this variable on purpose. An
 * omission can never silently unprotect the shop; only a deliberate act can,
 * and that act is greppable and named for what it does.
 *
 * It exists because `next start` sets NODE_ENV=production, so the e2e suite —
 * which must run against a production build to test the headers and the static
 * shell — would otherwise be locked out of its own login page. Set it for local
 * and CI test runs. Never set it on the live shop.
 */
function failOpenOptOut(): boolean {
  return process.env.RATE_LIMIT_FAIL_OPEN === "1";
}

const limiters = new Map<string, Ratelimit>();

function getLimiter(tier: Tier): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  let limiter = limiters.get(tier.prefix);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(tier.tokens, tier.window),
      prefix: tier.prefix,
    });
    limiters.set(tier.prefix, limiter);
  }
  return limiter;
}

export async function getClientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/**
 * Returns true when the request is allowed.
 *
 * Two failure modes, deliberately treated as opposites:
 *
 *  1. NOT CONFIGURED — no Upstash URL/token, or a placeholder left in place.
 *     In production this now fails CLOSED. It used to return true with nothing
 *     but a console.warn, which meant a single typo'd environment variable
 *     silently disabled all eleven tiers — auth, payment verify, guest order,
 *     webhooks — on a live shop, with no signal that anything was wrong.
 *     A misconfigured deploy should break loudly and immediately (login and
 *     checkout start refusing, Sentry fires) rather than quietly serve an
 *     unprotected site. Outside production it still allows, so local dev and
 *     preview builds work without Redis.
 *
 *  2. REDIS OUTAGE — configured correctly, but the call threw. This still
 *     fails OPEN. The distinction is that #1 is our mistake and is fixed in
 *     minutes by setting a variable, whereas #2 is a third party being down
 *     and must not take checkout with it. It is reported rather than logged so
 *     the degraded window is visible instead of silent.
 */
export async function checkRateLimit(tierName: keyof typeof TIERS, key: string): Promise<boolean> {
  const limiter = getLimiter(TIERS[tierName]);

  if (!limiter) {
    if (process.env.NODE_ENV === "production" && !failOpenOptOut()) {
      console.error(
        `[rate-limit] DENYING ${tierName}: Upstash is not configured in production. ` +
          "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN."
      );
      return false;
    }
    return true; // dev/preview, or an explicit opt-out — see note above
  }

  try {
    const { success } = await limiter.limit(key);
    return success;
  } catch (err) {
    console.error("[rate-limit] check failed — allowing request", err);
    return true;
  }
}

export const RATE_LIMIT_MESSAGE = "Too many requests. Please wait a few minutes and try again.";
