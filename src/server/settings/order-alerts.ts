import { prisma } from "@/server/db";

/**
 * Who gets the "New order" email — set by the owner in Settings.
 *
 * Kept in its OWN StoreSetting row ("orderAlerts"), not inside the "store"
 * settings blob: that blob is read by the cart and checkout and parts of it
 * reach shoppers' pages, and staff email addresses have no business anywhere
 * near a storefront. This row is read by exactly two things — the alert sender
 * (server/orders/owner-alert.ts) and the owner's Settings page.
 *
 * An EMPTY list is not "nobody": it falls back to the owner accounts, so a
 * shop that never opens this setting still hears about its orders.
 */
const KEY = "orderAlerts";
export const MAX_ALERT_EMAILS = 10;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trimmed, lower-cased, valid, de-duplicated and capped. */
export function cleanAlertEmails(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const e = raw.trim().toLowerCase();
    if (EMAIL.test(e) && e.length <= 254 && !out.includes(e)) out.push(e);
  }
  return out.slice(0, MAX_ALERT_EMAILS);
}

export async function getOrderAlertEmails(): Promise<string[]> {
  const row = await prisma.storeSetting.findUnique({ where: { key: KEY } });
  const value = row?.value as { emails?: unknown } | null | undefined;
  return cleanAlertEmails(value?.emails);
}

export async function saveOrderAlertEmails(emails: string[]): Promise<string[]> {
  const clean = cleanAlertEmails(emails);
  await prisma.storeSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: { emails: clean } },
    update: { value: { emails: clean } },
  });
  return clean;
}

/**
 * Who an alert actually goes to right now: the configured list, or — when it
 * is empty — every owner account.
 */
export async function resolveAlertRecipients(): Promise<{ to: string[]; fromList: boolean }> {
  const configured = await getOrderAlertEmails();
  if (configured.length > 0) return { to: configured, fromList: true };
  const owners = await prisma.user.findMany({ where: { role: "superadmin" }, select: { email: true } });
  return { to: owners.map((o) => o.email), fromList: false };
}
