import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/db";
import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { isAdmin } from "@/server/auth/roles";

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

  // The owner passes every gate an admin or editor passes, so the many
  // requireRole("admin") call sites need no knowledge of the owner role.
  // Owner-ONLY gates use requireOwner() below.
  if (!user || !(allowed.includes(user.role) || user.role === "superadmin")) {
    throw new Error("FORBIDDEN");
  }

  return { ...session, user: { ...session.user, role: user.role } };
}

/**
 * The owner-only gate: staff and roles, the books, store settings, coupons,
 * refunds, deletes, exports and the activity log. An admin is refused.
 */
export async function requireOwner() {
  return requireRole("superadmin");
}

/**
 * requireRole() for PAGES and the data loaders pages call — refuses with a
 * redirect instead of a thrown FORBIDDEN.
 *
 * ⚠️  Why pages need their own. Next renders a layout and its page IN PARALLEL,
 * so when the admin layout's gate redirects a demoted or deleted admin to
 * /login, the page and its loaders are already running and each one threw
 * FORBIDDEN. The visitor was refused either way — the check worked — but every
 * refusal landed in Sentry as an unhandled crash, and on a page with no layout
 * redirect of its own (the newsletter page) the visitor saw "This page didn't
 * load" instead of the login form. A redirect is not an error: Next handles it
 * and Sentry ignores it.
 *
 * Server Actions and Route Handlers keep plain requireRole(): a hard
 * FORBIDDEN is the right answer to a forged POST, and the caller handles it.
 *
 * Someone who IS an admin but failed an owner-only check goes back to the
 * dashboard, not to /login — the login form would only send them round again.
 */
export async function requireRoleForPage(...allowed: Role[]) {
  try {
    return await requireRole(...allowed);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "FORBIDDEN") throw error;
    redirect(isAdmin(await getCurrentRole()) ? "/admin" : "/login?redirect=/admin");
  }
}

/** requireOwner() for pages and their loaders — see requireRoleForPage. */
export async function requireOwnerForPage() {
  return requireRoleForPage("superadmin");
}
