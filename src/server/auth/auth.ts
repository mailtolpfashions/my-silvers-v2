import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/server/db";
import { authConfig } from "@/server/auth/auth.config";
import { isLocked, recordFailedAttempt, resetFailedAttempts } from "@/server/auth/lockout";
import { passwordFingerprint } from "@/server/auth/password-fingerprint";
import { isStaff } from "@/server/auth/roles";
import { logActivityForUser } from "@/server/activity/log";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  callbacks: {
    ...authConfig.callbacks,
    /**
     * Google sign-in rules — see `allowDangerousEmailAccountLinking` in
     * auth.config.ts for why linking is on at all.
     *
     * Runs BEFORE the adapter links or creates the user and before the jwt
     * callback, so what is changed here is what the new session sees.
     */
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true;

      // Linking by email is only safe if Google itself vouches for the email.
      if (!profile?.email || profile.email_verified !== true) return false;

      const email = profile.email.toLowerCase();
      const existing = await prisma.user.findUnique({
        where: { email },
        select: { id: true, emailVerified: true, blockedAt: true },
      });
      // Blocked by the owner — Google proving the inbox doesn't lift that.
      if (existing?.blockedAt) return false;
      if (existing && !existing.emailVerified) {
        // Google has just proved this inbox belongs to whoever is signing in.
        // Any password on the row was set without that proof — possibly by
        // someone else — so it goes, and the email counts as confirmed.
        await prisma.user.update({
          where: { id: existing.id },
          data: { emailVerified: new Date(), passwordHash: null },
        });
      }
      return true;
    },
  },
  events: {
    // Staff sign-ins go in the owner's activity log; customers' do not.
    async signIn({ user, account }) {
      if (!user.id) return;
      const row = await prisma.user
        .findUnique({ where: { id: user.id }, select: { role: true } })
        .catch(() => null);
      if (!isStaff(row?.role)) return;
      await logActivityForUser(user.id, {
        action: "staff.signin",
        target: { type: "user", id: user.id },
        summary: `Signed in${account?.provider === "google" ? " with Google" : ""}`,
      });
    },
    // A brand-new Google user: Google verified the address.
    async createUser({ user }) {
      if (!user.id) return;
      await prisma.user
        .update({ where: { id: user.id }, data: { emailVerified: new Date() } })
        .catch(() => {});
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
        if (!user || !user.passwordHash) return null;

        // Blocked by the owner (Customers → Block). Checked before the
        // password, so a blocked account learns nothing about its password.
        if (user.blockedAt) {
          throw new Error("ACCOUNT_BLOCKED");
        }

        if (isLocked(user)) {
          throw new Error("ACCOUNT_LOCKED");
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          await recordFailedAttempt(user.id);
          return null;
        }

        await resetFailedAttempts(user.id);
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          pwf: await passwordFingerprint(user.passwordHash),
        };
      },
    }),
    ...authConfig.providers,
  ],
});
