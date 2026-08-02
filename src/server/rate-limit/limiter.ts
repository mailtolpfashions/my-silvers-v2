import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";

/**
 * Upstash-backed sliding-window rate limiting — correct across all serverless
 * instances, unlike the old site's in-memory express-rate-limit which
 * fragmented per instance. Tiers mirror the old site's
 * by-endpoint-sensitivity philosophy.
 *
 * Degrades to a no-op (with one boot-time warning) when Upstash env vars are
 * absent/placeholders, so local dev works without Redis.
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
      console.warn("[rate-limit] Upstash not configured — rate limiting is DISABLED.");
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
  newsletter: { tokens: 3, window: "15 m", prefix: "rl:newsletter" },
  review: { tokens: 5, window: "15 m", prefix: "rl:review" },
} as const satisfies Record<string, Tier>;

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

/** Returns true when the request is allowed. */
export async function checkRateLimit(tierName: keyof typeof TIERS, key: string): Promise<boolean> {
  const limiter = getLimiter(TIERS[tierName]);
  if (!limiter) return true; // unconfigured — allow
  try {
    const { success } = await limiter.limit(key);
    return success;
  } catch (err) {
    // A Redis outage must never take checkout down with it.
    console.error("[rate-limit] check failed — allowing request", err);
    return true;
  }
}

export const RATE_LIMIT_MESSAGE = "Too many requests. Please wait a few minutes and try again.";
