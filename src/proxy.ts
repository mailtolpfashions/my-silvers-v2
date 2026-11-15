import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/server/auth/auth.config";
import { safeRedirectPath } from "@/server/auth/google-enabled";
import { isAdmin, isStaff } from "@/server/auth/roles";

const { auth } = NextAuth(authConfig);

/** Paths whose access depends on a role, not just on being signed in. */
function isRoleGated(pathname: string) {
  return ["/admin", "/cms", "/preview"].some((p) => pathname.startsWith(p));
}

// Media delete is deliberately editor-allowed (parity with the old Studio);
// only schema-level routes are admin-gated here. Destructive ENTRY actions
// (unpublish/delete/restore) are Server Actions gated by requireRole("admin").
const ADMIN_ONLY_CMS_PREFIXES = ["/cms/content-types"];

function isDestructiveCmsRoute(pathname: string) {
  return ADMIN_ONLY_CMS_PREFIXES.some((p) => pathname.startsWith(p));
}

// Optimistic, cookie-only auth check (Next.js 16 Proxy — renamed from
// Middleware, same functionality). Runs on the Node.js runtime by default,
// but deliberately avoids any database call here per Next.js's own guidance
// (Proxy runs on every route, including prefetches) — this is pre-filtering
// only. Every Server Action/Route Handler under /admin and /cms independently
// re-checks the role server-side via requireRole() (see src/server/auth/require-role.ts).
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const role = req.auth?.user?.role;

  // Already signed in → the sign-in and register forms have nothing to offer.
  // Reloading /login after signing in from another tab used to show the form
  // again while the header beside it said you were signed in. Send them on to
  // where they were going, or to their account.
  //
  // ⚠️  Never towards /admin, /cms or /preview. The role in this cookie is
  // frozen at sign-in (see e2e/role-revocation.spec.ts); the pages re-read it
  // from the database and send a demoted or deleted admin to
  // /login?redirect=/admin. Redirecting that back to /admin on the cookie's
  // stale say-so would loop until the browser gives up — so for a role-gated
  // destination the form is shown, exactly as before.
  if ((pathname === "/login" || pathname === "/register") && req.auth) {
    const wanted = safeRedirectPath(req.nextUrl.searchParams.get("redirect"));
    if (!isRoleGated(wanted)) {
      const target = wanted === "/" ? "/account" : wanted;
      return NextResponse.redirect(new URL(target, req.nextUrl.origin));
    }
  }

  if (pathname.startsWith("/admin")) {
    if (!isAdmin(role)) {
      const loginUrl = new URL("/login", req.nextUrl.origin);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  if (pathname.startsWith("/cms")) {
    if (!isStaff(role)) {
      const loginUrl = new URL("/login", req.nextUrl.origin);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (isDestructiveCmsRoute(pathname) && !isAdmin(role)) {
      return NextResponse.redirect(new URL("/cms", req.nextUrl.origin));
    }
  }

  // The CMS live-preview target. It renders draft HTML unsanitized, which is
  // safe on its own terms — the draft only ever arrives by same-origin
  // postMessage from the editor, never from the database, so the exposure is
  // self-XSS. It is gated anyway because an unauthenticated route that renders
  // arbitrary HTML is a liability worth closing while it costs one line, and
  // because a preview pane is an authoring tool regardless of its blast radius.
  if (pathname.startsWith("/preview")) {
    if (!isStaff(role)) {
      const loginUrl = new URL("/login", req.nextUrl.origin);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  if (pathname.startsWith("/account") && !req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/admin/:path*",
    "/cms/:path*",
    "/preview/:path*",
    "/account/:path*",
    "/login",
    "/register",
  ],
};
