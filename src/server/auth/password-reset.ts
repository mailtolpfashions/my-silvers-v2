import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/server/db";
import { sendPasswordResetEmail, sendPasswordSetupEmail } from "@/server/email/resend";

const RESET_TOKEN_EXPIRY_MS = 30 * 60 * 1000;

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Always resolves without revealing whether the email exists — callers
 * should show the same "check your email" message either way.
 *
 * Three kinds of row behind an email:
 *   - a password account → the usual reset link;
 *   - a GUEST row (no password, no Google sign-in) → a "set your password"
 *     link. These used to get nothing, so anyone who had ever checked out as a
 *     guest could neither register ("already exists") nor reset — a dead end;
 *   - Google-only → nothing; they sign in with Google.
 */
export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, email: true, passwordHash: true, _count: { select: { accounts: true } } },
  });
  if (!user) return;
  const isGuestRow = !user.passwordHash && user._count.accounts === 0;
  if (!user.passwordHash && !isGuestRow) return; // Google-only account

  const rawToken = crypto.randomBytes(32).toString("hex");
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetTokenHash: hashToken(rawToken),
      passwordResetExpiresAt: new Date(Date.now() + RESET_TOKEN_EXPIRY_MS),
    },
  });

  /**
   * Caught and logged, never rethrown.
   *
   * ⚠️  Not tidiness — enumeration. This line only runs when the account
   * EXISTS. Letting a send failure reach the page would show an error for
   * registered emails and the usual "if an account exists…" for everyone else,
   * which hands an outsider the answer the neutral message exists to withhold.
   * The log is how the shop finds out instead.
   */
  try {
    if (isGuestRow) await sendPasswordSetupEmail(user.email, rawToken);
    else await sendPasswordResetEmail(user.email, rawToken);
  } catch (err) {
    console.error("[email] password-reset failed", err);
  }
}

export async function resetPassword(rawToken: string, newPassword: string) {
  const tokenHash = hashToken(rawToken);
  const user = await prisma.user.findFirst({
    where: {
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { gt: new Date() },
    },
  });
  if (!user) throw new Error("INVALID_OR_EXPIRED_TOKEN");

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
      // The link reached this inbox, so the address is proven — the same proof
      // the confirmation link gives. See server/auth/email-verification.ts.
      emailVerified: user.emailVerified ?? new Date(),
    },
  });
}
