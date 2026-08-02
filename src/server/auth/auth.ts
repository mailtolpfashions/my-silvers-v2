import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/server/db";
import { authConfig } from "@/server/auth/auth.config";
import { isLocked, recordFailedAttempt, resetFailedAttempts } from "@/server/auth/lockout";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
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

        if (isLocked(user)) {
          throw new Error("ACCOUNT_LOCKED");
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          await recordFailedAttempt(user.id);
          return null;
        }

        await resetFailedAttempts(user.id);
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
    ...authConfig.providers,
  ],
});
