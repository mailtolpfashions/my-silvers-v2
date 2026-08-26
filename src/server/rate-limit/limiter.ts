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
      // Two states here, not three. The opt-out used to need a branch of its
      // own so the log would not cry misconfiguration at a deliberate choice —
      // but checkRateLimit now returns before this is ever reached when the
      // flag is set, and warnOptOut says that plainly instead.
      const state =
        process.env.NODE_ENV !== "production"
          ? "rate limiting is DISABLED (non-production)."
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
  /**
   * Guest checkout, keyed by EMAIL ADDRESS.
   *
   * ⚠️  This was 3 per 30 minutes keyed by IP, and in India that is a way to
   * refuse real customers. Jio and Airtel put subscribers behind CGNAT, so
   * thousands of people share one public address — three guest orders from
   * anywhere behind that NAT would lock out everyone else on it for half an
   * hour. On a shop whose traffic is mostly mobile, that is not a rare edge
   * case; it is a normal Tuesday.
   *
   * The email is the honest identity for a guest order: two strangers on the
   * same carrier have different ones, while the same person ordering four
   * times in half an hour is the case worth stopping. The count stays tight
   * because a genuine customer never needs a fourth.
   */
  guestOrder: { tokens: 3, window: "30 m", prefix: "rl:guestorder" },

  /**
   * The backstop for the above: guest orders from one IP, whatever email they
   * claim. Loose on purpose — it exists to stop a script working through a
   * list of addresses, not to police a household or a carrier NAT.
   *
   * 40 in 30 minutes is far more than a shared address will produce honestly
   * and far less than bulk abuse needs to be worth the effort. Skipped
   * entirely when the IP is unknown; see getClientIp.
   */
  guestOrderIp: { tokens: 40, window: "30 m", prefix: "rl:guestorderip" },
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

let warnedOptOut = false;

/**
 * Says once, out loud, that the shop is running unprotected.
 *
 * getRedis has its own warning, but it only speaks when Upstash is absent —
 * which is no longer the same situation. A server with working credentials that
 * is ignoring them on purpose must still announce itself, or the only evidence
 * is an environment variable nobody thinks to look at.
 */
function warnOptOut(): void {
  if (warnedOptOut) return;
  console.warn(
    "[rate-limit] DISABLED — RATE_LIMIT_FAIL_OPEN is set. Every tier allows every " +
      "request, configured or not. This belongs in the test runner only; never set it on the live shop."
  );
  warnedOptOut = true;
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

/**
 * The caller's IP, or null when it genuinely cannot be determined.
 *
 * ⚠️  This returned the literal string "unknown" as a fallback, and that was
 * worse than returning nothing. A shared constant is a shared BUCKET: with no
 * `x-forwarded-for` — which is every request when the app runs without a proxy
 * in front of it — every visitor on earth counted against one `guestOrder`
 * allowance. Three guest orders per half hour, site-wide, for everybody.
 *
 * Refusing to guess is the safer failure. An unidentifiable client now skips
 * IP-based limiting entirely, and the tier that actually protects guest
 * checkout keys on the email address instead — see placeOrderAction. Losing
 * the IP backstop when the deployment is misconfigured is a real weakening,
 * but it is bounded and loud, where lumping strangers together silently
 * refused real customers.
 *
 * Vercel always sets the header, so on the intended deployment this never
 * returns null.
 */
export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;

  if (!warnedNoIp) {
    console.warn(
      "[rate-limit] no x-forwarded-for header — IP-based limits are being SKIPPED. " +
        "Expected behind a proxy that sets it (Vercel does)."
    );
    warnedNoIp = true;
  }
  return null;
}

let warnedNoIp = false;

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
  /**
   * The opt-out is checked FIRST, before Upstash is consulted at all.
   *
   * ⚠️  It used to be reachable only inside the `!limiter` branch below, which
   * meant it opted out of nothing as soon as real credentials existed. The
   * moment Upstash was configured locally, the e2e suite started spending the
   * live `auth` tier — five sign-ins per fifteen minutes, shared by four
   * workers all arriving from 127.0.0.1 — and locked itself out of its own
   * login page on the first test. The flag is named for turning rate limiting
   * off; it now does that.
   *
   * Safe because the flag is never set on a deployment: it is absent from
   * `.env` and from Vercel, and lives only in playwright.config.ts's webServer
   * env. Forgetting to configure Upstash still fails closed — that asymmetry is
   * untouched.
   */
  if (failOpenOptOut()) {
    warnOptOut();
    return true;
  }

  const limiter = getLimiter(TIERS[tierName]);

  if (!limiter) {
    // No `&& !failOpenOptOut()` here any more — the opt-out returned above, so
    // reaching this line means it is not set.
    if (process.env.NODE_ENV === "production") {
      console.error(
        `[rate-limit] DENYING ${tierName}: Upstash is not configured in production. ` +
          "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN."
      );
      return false;
    }
    return true; // dev or preview, running without Redis
  }

  try {
    const { success } = await limiter.limit(key);
    return success;
  } catch (err) {
    console.error("[rate-limit] check failed — allowing request", err);
    return true;
  }
}

/**
 * The IP-keyed check, with the "we don't know who this is" policy in one place.
 *
 * Every caller that limits by address wants the same answer when there is no
 * address: skip the check rather than count this visitor against a bucket
 * shared with every other unidentifiable one. Spelling that out at eight call
 * sites is how the eighth ends up doing something different.
 *
 * ⚠️  Skipping is a real weakening, and it is the lesser one. A shared "unknown"
 * key does not protect anything — an attacker is in the same bucket as the
 * customers they are denying — while it does reliably refuse real people. On
 * the intended deployment the header is always present and this never skips.
 */
export async function checkIpRateLimit(tierName: keyof typeof TIERS): Promise<boolean> {
  const ip = await getClientIp();
  if (!ip) return true;
  return checkRateLimit(tierName, ip);
}

export const RATE_LIMIT_MESSAGE = "Too many requests. Please wait a few minutes and try again.";
