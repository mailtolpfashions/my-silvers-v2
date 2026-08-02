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
  session: { strategy: "jwt" },
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
