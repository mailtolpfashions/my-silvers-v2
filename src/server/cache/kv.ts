import { Redis } from "@upstash/redis";

/**
 * A tiny shared key-value cache, for slow third-party answers that every
 * server instance would otherwise fetch again (Shiprocket's login token and
 * its per-pincode serviceability).
 *
 * Upstash, the same Redis the rate limiter uses — shared across all of
 * Vercel's serverless instances, which is the whole point: an in-memory
 * cache dies with every cold start, and cold starts are most requests on a
 * shop this size. Falls back to an in-process Map when Upstash is not
 * configured (local dev), and to "no cache" if Upstash errors — a cache must
 * never be the reason a request fails.
 */

function configured(): boolean {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? "";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
  return url.startsWith("https://") && !url.includes("xxxxxxxxxxxx") && token.length > 20;
}

let redis: Redis | null = null;
function client(): Redis | null {
  if (!configured()) return null;
  redis ??= new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  return redis;
}

const memory = new Map<string, { value: unknown; expires: number }>();
const PREFIX = "kv:";

export async function kvGet<T>(key: string): Promise<T | null> {
  const r = client();
  if (!r) {
    const hit = memory.get(key);
    if (!hit || hit.expires < Date.now()) return null;
    return hit.value as T;
  }
  try {
    return (await r.get<T>(PREFIX + key)) ?? null;
  } catch (err) {
    console.error("[kv] get failed — continuing uncached", err);
    return null;
  }
}

export async function kvSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const r = client();
  if (!r) {
    memory.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
    return;
  }
  try {
    await r.set(PREFIX + key, value, { ex: ttlSeconds });
  } catch (err) {
    console.error("[kv] set failed — continuing uncached", err);
  }
}

export async function kvDelete(key: string): Promise<void> {
  memory.delete(key);
  const r = client();
  if (!r) return;
  try {
    await r.del(PREFIX + key);
  } catch {
    // Best effort; the entry expires on its own.
  }
}
