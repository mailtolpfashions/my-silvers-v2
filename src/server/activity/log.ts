import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { prisma } from "@/server/db";

/**
 * The owner's activity log — who did what in the admin and the CMS.
 *
 * Call it AFTER the thing has happened, with the session that requireRole() /
 * requireOwner() returned (its role is the fresh one from the database):
 *
 *   const session = await requireOwner();
 *   …do the work…
 *   await logActivity(session, {
 *     action: "product.delete",
 *     target: { type: "product", id },
 *     summary: `Deleted product “${name}”`,
 *   });
 *
 * ⚠️  It NEVER throws. A log write that fails must not turn a refund that went
 * through into an error on screen — the shopper's money moved either way, and
 * an admin who sees "failed" will try again. A failure is reported to the
 * server log (and so to Sentry) instead.
 *
 * Read by src/server/admin/activity.ts. Areas for the page's filter come from
 * the part of `action` before the dot — keep to the AREAS list there.
 */
export type ActivityEntry = {
  /** "<area>.<verb>", e.g. "order.refund", "staff.role", "settings.update". */
  action: string;
  target?: { type: string; id?: string | null };
  /** One sentence a person can read without opening anything else. */
  summary: string;
  /** Anything worth keeping for later — before/after values, amounts, counts. */
  details?: Prisma.InputJsonValue;
};

type Actor = { user: { id?: string | null; email?: string | null; role?: Role | string | null } };

export async function logActivity(actor: Actor, entry: ActivityEntry): Promise<void> {
  try {
    const { id, email, role } = actor.user;
    await prisma.activityLog.create({
      data: {
        actorId: id ?? null,
        actorEmail: email ?? "unknown",
        actorRole: (role as Role) ?? "admin",
        action: entry.action,
        targetType: entry.target?.type ?? null,
        targetId: entry.target?.id ?? null,
        summary: entry.summary.slice(0, 500),
        details: entry.details,
      },
    });
  } catch (err) {
    console.error("[activity] could not record", entry.action, err);
  }
}

/** For callers that only have a user id (e.g. the sign-in event). */
export async function logActivityForUser(userId: string, entry: ActivityEntry): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });
    if (!user) return;
    await logActivity({ user }, entry);
  } catch (err) {
    console.error("[activity] could not record", entry.action, err);
  }
}
