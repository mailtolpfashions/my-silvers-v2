import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/db";
import type { Role } from "@/generated/prisma/enums";

/**
 * The role as the DATABASE has it right now — never the copy baked into the JWT.
 *
 * ⚠️  Why this exists at all. `auth.config.ts` writes `token.role` only when
 * `user` is present, which is once, at sign-in. Nothing re-reads it afterwards,
 * so `session.user.role` is a snapshot of what the user was when they last
 * logged in. Demote an admin to `customer`, or fire them, and their existing
 * token keeps saying `admin` until it expires — which was 30 days by default.
 *
 * That made revocation a no-op for a month on every gate that trusted the
 * session: both dashboard layouts and every `requireRole()` call. Session
 * `maxAge` is now bounded (see auth.config.ts), but a bound is not a revocation
 * — so anything that decides what a user may DO reads the role from here.
 *
 * The cost is one indexed primary-key lookup per guarded render or action.
 * That is a real cost and it is accepted deliberately: admin and CMS traffic is
 * a rounding error next to the storefront, and this is the query that decides
 * who may issue a refund.
 */
export async function getCurrentRole(): Promise<Role | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  // No row means the account was deleted while the token was still valid.
  return user?.role ?? null;
}

/**
 * Defense-in-depth role check for Server Actions and Route Handlers.
 * Proxy already gates page navigation optimistically, but every mutating entry
 * point must re-check independently — never trust the proxy alone.
 *
 * The returned session carries the FRESH role, not the token's, so a caller
 * that reads `session.user.role` afterwards cannot act on the stale value.
 */
export async function requireRole(...allowed: Role[]) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("FORBIDDEN");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!user || !allowed.includes(user.role)) {
    throw new Error("FORBIDDEN");
  }

  return { ...session, user: { ...session.user, role: user.role } };
}
