import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/server/auth/auth.config";

const { auth } = NextAuth(authConfig);

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

  if (pathname.startsWith("/admin")) {
    if (role !== "admin") {
      const loginUrl = new URL("/login", req.nextUrl.origin);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  if (pathname.startsWith("/cms")) {
    if (!role || (role !== "admin" && role !== "editor")) {
      const loginUrl = new URL("/login", req.nextUrl.origin);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (isDestructiveCmsRoute(pathname) && role !== "admin") {
      return NextResponse.redirect(new URL("/cms", req.nextUrl.origin));
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
  matcher: ["/admin/:path*", "/cms/:path*", "/account/:path*"],
};
