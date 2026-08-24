import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Edge-safe subset of the Auth.js config — no Prisma/pg imports here.
 * Used directly by middleware.ts (which runs on the Edge runtime and can only
 * read/refresh the JWT, never touch the database). The full config in
 * auth.ts extends this with the Credentials provider + PrismaAdapter for use
 * in Route Handlers and Server Components/Actions (Node runtime).
 */
export const authConfig = {
  /**
   * `maxAge` is bounded deliberately. Auth.js defaults a JWT session to 30
   * days, and `token.role` below is written once at sign-in and never
   * refreshed — so the default meant a revoked admin kept their role for a
   * month on any gate that trusted the session.
   *
   * The real revocation fix is `getCurrentRole()`, which re-reads the database
   * (see require-role.ts). This bound is the second half: it caps how long the
   * proxy's optimistic, cookie-only pre-filter can be wrong about who someone
   * is. Seven days rather than one because the proxy only decides whether a
   * page SHELL renders — every action and every sensitive read behind it goes
   * to the database — and logging shoppers out daily is a real conversion cost
   * for no security gain.
   *
   * `updateAge` slides the window at most hourly, so an active session is not
   * re-signing the cookie on every request.
   */
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60, updateAge: 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role?: "customer" | "admin" | "editor" }).role ?? "customer";
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      return session;
    },
  },
} satisfies NextAuthConfig;
