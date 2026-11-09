import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { passwordFingerprint } from "@/server/auth/password-fingerprint";

export const authConfig = {
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60, updateAge: 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      /**
       * Lets "Sign in with Google" open an existing account with the same
       * email — most importantly a past guest's, which otherwise hit
       * OAuthAccountNotLinked and could never sign in.
       *
       * Safe here because Google has verified the address (the signIn
       * callback in auth.ts refuses an unverified Google email), and because
       * that callback wipes any password set on an UNCONFIRMED account before
       * linking — so someone who squatted the email with a password of their
       * own does not keep access alongside the real owner.
       */
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role?: "customer" | "admin" | "editor" }).role ?? "customer";
        // Credentials sign-in supplies pwf; an adapter user (Google) carries
        // its row's passwordHash instead.
        token.pwf = user.pwf ?? (await passwordFingerprint(user.passwordHash));
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.pwf = token.pwf;
      return session;
    },
  },
} satisfies NextAuthConfig;
