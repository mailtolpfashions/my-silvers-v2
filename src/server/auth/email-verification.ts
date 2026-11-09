import crypto from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { sendEmailVerificationEmail } from "@/server/email/resend";
import { passwordFingerprint } from "@/server/auth/password-fingerprint";

/**
 * Email confirmation, and the one rule it exists to enforce:
 *
 *   An account sees GUEST orders placed with its email only once the owner has
 *   proved the inbox is theirs.
 *
 * Why. Neither sign-up nor guest checkout verifies an email, and guest checkout
 * files each order under whichever user row already has that address
 * (resolveGuestUser). So anyone could register priya@gmail.com with their own
 * password, and every later guest order the real Priya placed — her name,
 * address, phone, what she bought — would appear in the stranger's account.
 *
 * Sign-in is NOT blocked for unconfirmed accounts: confirmation emails land in
 * spam, and a shop that refuses its own customers loses them. The protection
 * is narrower and sufficient — orders placed while SIGNED IN always belong to
 * the account (the session proves who placed them); guest orders, which carry
 * a confirmationToken, stay hidden until the email is confirmed.
 *
 * Proof of inbox is any of: the confirmation link, a password reset/setup link
 * (it went to the inbox), or a Google sign-in (Google verified the address).
 */

/**
 * Accounts that existed before this rule shipped are treated as confirmed —
 * decided with the shop owner while the site was still in testing, so existing
 * customers keep seeing their past guest orders. Only real accounts qualify (a
 * password or a linked Google sign-in); bare guest rows still need proof.
 *
 * Done in code rather than as a data migration because production migrations
 * are applied by hand (docs/LAUNCH.md §1.2), and a forgotten step there would
 * hide every existing customer's guest orders.
 */
// When this rule was built — not a later date. A future cut-off would let
// accounts registered in the gap be grandfathered in, which is the hole this
// file exists to close (the e2e test caught exactly that).
const CONFIRMATION_RULE_STARTED = new Date("2026-11-09T15:00:00+05:30");

type ConfirmableUser = {
  emailVerified: Date | null;
  createdAt: Date;
  passwordHash: string | null;
  _count?: { accounts: number };
};

export function isEmailConfirmed(user: ConfirmableUser): boolean {
  if (user.emailVerified) return true;
  const realAccount = !!user.passwordHash || (user._count?.accounts ?? 0) > 0;
  return realAccount && user.createdAt < CONFIRMATION_RULE_STARTED;
}

const CONFIRMABLE_SELECT = {
  emailVerified: true,
  createdAt: true,
  passwordHash: true,
  _count: { select: { accounts: true } },
} as const;

export async function isUserEmailConfirmed(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: CONFIRMABLE_SELECT });
  return !!user && isEmailConfirmed(user);
}

/**
 * The `where` for "orders this signed-in account may see or act on". Every
 * customer-side order read or write goes through this — the list, the detail
 * page, the invoice, cancel, return and both review checks — so the rule
 * cannot be forgotten at one of them.
 */
export async function accountOrderScope(sessionUser: {
  id: string;
  pwf?: string;
}): Promise<Prisma.OrderWhereInput> {
  const userId = sessionUser.id;
  const signedInOnly = { userId, confirmationToken: null }; // guest orders carry a token
  const user = await prisma.user.findUnique({ where: { id: userId }, select: CONFIRMABLE_SELECT });
  if (!user || !isEmailConfirmed(user)) return signedInOnly;

  // The session must have signed in with the CURRENT password — see
  // server/auth/password-fingerprint.ts. Sessions issued before fingerprints
  // existed have none and are let through; they expire within seven days.
  if (sessionUser.pwf !== undefined && sessionUser.pwf !== (await passwordFingerprint(user.passwordHash))) {
    return signedInOnly;
  }
  return { userId };
}

// ── The confirmation link ───────────────────────────────────────────────────

const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const IDENTIFIER_PREFIX = "verify-email:";

const hash = (raw: string) => crypto.createHash("sha256").update(raw).digest("hex");

/**
 * Issues a fresh link (replacing any earlier one) and emails it. Never throws:
 * a failed send is logged, and the account banner offers a resend.
 */
export async function sendEmailConfirmation(user: { email: string; name?: string | null }) {
  const identifier = IDENTIFIER_PREFIX + user.email.toLowerCase();
  const raw = crypto.randomBytes(32).toString("hex");
  try {
    await prisma.$transaction([
      prisma.verificationToken.deleteMany({ where: { identifier } }),
      prisma.verificationToken.create({
        // Stored hashed, like password reset tokens: a database leak must not
        // hand out working links.
        data: { identifier, token: hash(raw), expires: new Date(Date.now() + LINK_TTL_MS) },
      }),
    ]);
    await sendEmailVerificationEmail(user.email, raw, user.name ?? null);
  } catch (err) {
    console.error("[email] verification send failed", err);
  }
}

/** Consumes a link. Returns the confirmed email, or null if invalid/expired. */
export async function confirmEmailToken(raw: string): Promise<string | null> {
  if (!/^[a-f0-9]{64}$/.test(raw)) return null;
  const row = await prisma.verificationToken.findUnique({ where: { token: hash(raw) } });
  if (!row || !row.identifier.startsWith(IDENTIFIER_PREFIX)) return null;

  await prisma.verificationToken.delete({ where: { token: row.token } }).catch(() => {});
  if (row.expires < new Date()) return null;

  const email = row.identifier.slice(IDENTIFIER_PREFIX.length);
  const { count } = await prisma.user.updateMany({
    where: { email, emailVerified: null },
    data: { emailVerified: new Date() },
  });
  // count 0 also covers "already confirmed" — that is still a success.
  if (count === 0 && !(await prisma.user.findUnique({ where: { email }, select: { id: true } }))) {
    return null;
  }
  return email;
}
