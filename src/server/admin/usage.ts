import { v2 as cloudinary } from "cloudinary";
import { prisma } from "@/server/db";

/**
 * How close the shop is to each free plan's limits.
 *
 * Only what can actually be MEASURED is a meter here: emails (the site counts
 * its own sends — Resend offers no usage figures), the database size (asked of
 * Postgres) and Cloudinary credits (its Admin API reports them). Vercel,
 * Sentry and Upstash give free accounts no usage API, so the Usage page links
 * to their dashboards instead of guessing.
 *
 * ⚠️  The limits are copied from each provider's free plan as of Nov 2026.
 * Providers change them; if a plan is upgraded, change the number here — it is
 * the only place they live.
 */
export const FREE_LIMITS = {
  /** Resend: 100 a day and 3,000 a month on the free plan. */
  emailsPerDay: 100,
  emailsPerMonth: 3_000,
  /** Supabase free: 500 MB database. */
  databaseBytes: 500 * 1024 * 1024,
  /** Cloudinary free: 25 credits over a rolling 30 days. */
  cloudinaryCredits: 25,
} as const;

/** At or above this share of a limit, the dashboard and the daily check warn. */
export const WARN_AT = 0.8;

export type UsageMeter = {
  key: "emails-day" | "emails-month" | "database" | "cloudinary";
  label: string;
  /** Plain words for the window, e.g. "last 24 hours". */
  window: string;
  used: number;
  limit: number;
  unit: "emails" | "bytes" | "credits";
  /** What hitting it would do, in shop terms. */
  impact: string;
  /** The provider's own dashboard. */
  href: string;
  /** Set when the reading failed — the meter is then unknown, not zero. */
  error?: string;
  /** Sends Resend refused in the window (emails only). */
  failed?: number;
};

export function share(m: UsageMeter): number {
  return m.limit > 0 ? m.used / m.limit : 0;
}

export function isWarning(m: UsageMeter): boolean {
  return !m.error && share(m) >= WARN_AT;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Emails and database — two cheap queries, safe on every dashboard load. */
export async function measureLocal(now = new Date()): Promise<UsageMeter[]> {
  const dayAgo = new Date(now.getTime() - DAY_MS);
  const monthAgo = new Date(now.getTime() - 30 * DAY_MS);

  const [day, dayFailed, month, size] = await Promise.all([
    prisma.emailSend.aggregate({ _sum: { recipients: true }, where: { createdAt: { gte: dayAgo } } }),
    prisma.emailSend.count({ where: { createdAt: { gte: dayAgo }, ok: false } }),
    prisma.emailSend.aggregate({ _sum: { recipients: true }, where: { createdAt: { gte: monthAgo } } }),
    prisma.$queryRaw<Array<{ bytes: bigint }>>`SELECT pg_database_size(current_database()) AS bytes`,
  ]);

  return [
    {
      key: "emails-day",
      label: "Emails",
      window: "last 24 hours",
      used: day._sum.recipients ?? 0,
      limit: FREE_LIMITS.emailsPerDay,
      unit: "emails",
      impact: "Order confirmations and alerts stop sending until the day resets. Orders still go through.",
      href: "https://resend.com/emails",
      failed: dayFailed,
    },
    {
      key: "emails-month",
      label: "Emails",
      window: "last 30 days",
      used: month._sum.recipients ?? 0,
      limit: FREE_LIMITS.emailsPerMonth,
      unit: "emails",
      impact: "All emails stop until the month resets.",
      href: "https://resend.com/emails",
    },
    {
      key: "database",
      label: "Database",
      window: "total size",
      used: Number(size[0]?.bytes ?? 0),
      limit: FREE_LIMITS.databaseBytes,
      unit: "bytes",
      impact: "The shop slows down, then can't save new orders.",
      href: "https://supabase.com/dashboard/projects",
    },
  ];
}

/** Cloudinary's own count of credits — a network call, so not on every page load. */
export async function measureCloudinary(): Promise<UsageMeter> {
  const meter: UsageMeter = {
    key: "cloudinary",
    label: "Images (Cloudinary)",
    window: "last 30 days",
    used: 0,
    limit: FREE_LIMITS.cloudinaryCredits,
    unit: "credits",
    impact: "Product images stop loading or uploading.",
    href: "https://console.cloudinary.com/settings/billing/usage",
  };
  try {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    const usage = (await cloudinary.api.usage()) as {
      credits?: { usage?: number; limit?: number };
    };
    meter.used = Number(usage.credits?.usage ?? 0);
    // Trust Cloudinary's own limit when it reports one — it follows the plan.
    if (usage.credits?.limit) meter.limit = Number(usage.credits.limit);
  } catch (err) {
    console.error("[usage] Cloudinary usage failed", err);
    meter.error = "Couldn't read Cloudinary's usage right now.";
  }
  return meter;
}

export async function measureAll(): Promise<UsageMeter[]> {
  const [local, images] = await Promise.all([measureLocal(), measureCloudinary()]);
  return [...local, images];
}

/** The last daily check's reading, for meters too costly to read live. */
export async function latestCheck() {
  const row = await prisma.usageCheck.findFirst({ orderBy: { takenAt: "desc" } });
  return row ? { takenAt: row.takenAt, meters: row.meters as unknown as UsageMeter[] } : null;
}

/**
 * The daily check: read everything, keep the reading, prune old rows.
 * Returns the meters at or over WARN_AT.
 */
export async function runUsageCheck() {
  const meters = await measureAll();
  await prisma.usageCheck.create({ data: { meters: meters as unknown as object } });

  const keep = await prisma.usageCheck.findMany({
    orderBy: { takenAt: "desc" },
    skip: 60,
    select: { id: true },
  });
  if (keep.length) await prisma.usageCheck.deleteMany({ where: { id: { in: keep.map((r) => r.id) } } });
  await prisma.emailSend.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * DAY_MS) } } });

  return { meters, warnings: meters.filter(isWarning) };
}

/** "412 of 3,000 emails", "14 MB of 500 MB", "3.2 of 25 credits". */
export function formatUsage(m: UsageMeter): string {
  if (m.unit === "bytes") return `${formatBytes(m.used)} of ${formatBytes(m.limit)}`;
  const n = (v: number) =>
    v.toLocaleString("en-IN", { maximumFractionDigits: m.unit === "credits" ? 1 : 0 });
  return `${n(m.used)} of ${n(m.limit)} ${m.unit}`;
}

function formatBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.round(b / 1024 ** 2)} MB`;
}
