"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { prisma } from "@/server/db";
import { signIn } from "@/server/auth/auth";
import { requestPasswordReset, resetPassword } from "@/server/auth/password-reset";
import { sendEmailConfirmation } from "@/server/auth/email-verification";
import { checkIpRateLimit, RATE_LIMIT_MESSAGE } from "@/server/rate-limit/limiter";
import {
  isDisposableEmail,
  DISPOSABLE_EMAIL_MESSAGE,
} from "@/server/auth/disposable-email";

export async function loginAction(
  _prevState: string | undefined,
  formData: FormData
): Promise<string | undefined> {
  if (!(await checkIpRateLimit("auth"))) return RATE_LIMIT_MESSAGE;
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: (formData.get("redirect") as string) || "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.cause?.err?.message === "ACCOUNT_LOCKED") {
        return "Too many failed attempts. Your account is temporarily locked — try again in 15 minutes.";
      }
      switch (error.type) {
        case "CredentialsSignin":
          return "Incorrect email or password.";
        default:
          return "Something went wrong. Please try again.";
      }
    }
    throw error;
  }
  return undefined;
}

export async function registerAction(
  _prevState: string | undefined,
  formData: FormData
): Promise<string | undefined> {
  if (!(await checkIpRateLimit("auth"))) return RATE_LIMIT_MESSAGE;

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!name || !email || !password) {
    return "All fields are required.";
  }
  if (password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (await isDisposableEmail(email)) {
    return DISPOSABLE_EMAIL_MESSAGE;
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { passwordHash: true, _count: { select: { accounts: true } } },
  });
  if (existing?.passwordHash) {
    return "An account with this email already exists.";
  }
  if (existing && existing._count.accounts > 0) {
    return "This email signs in with Google — please use “Continue with Google”.";
  }
  if (existing) {
    // A past GUEST: the row exists from checkout but has no password. This
    // used to say "already exists" — a dead end, since forgot-password also
    // ignored password-less rows. The password is NOT set from this form: the
    // form proves nothing about the inbox. The emailed link does, and it
    // confirms the email in the same step (resetPassword).
    await requestPasswordReset(email);
    return "We've emailed you a link to finish setting up your account. Please check your inbox.";
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { name, email, passwordHash, role: "customer" },
    select: { email: true, name: true },
  });
  // Not awaited for the user's sake — it never throws — but awaited so the
  // send is not cut off when the action returns on a serverless runtime.
  await sendEmailConfirmation(user);

  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) {
      return "Account created — please sign in.";
    }
    throw error;
  }
  return undefined;
}

export async function forgotPasswordAction(
  _prevState: string | undefined,
  formData: FormData
): Promise<string | undefined> {
  if (!(await checkIpRateLimit("auth"))) return RATE_LIMIT_MESSAGE;

  const email = String(formData.get("email") ?? "").trim();
  if (!email) return "Email is required.";

  await requestPasswordReset(email);
  // Always the same message — never reveal whether the account exists.
  return "If an account exists for that email, we've sent a password reset link.";
}

export async function resetPasswordAction(
  _prevState: string | undefined,
  formData: FormData
): Promise<string | undefined> {
  if (!(await checkIpRateLimit("auth"))) return RATE_LIMIT_MESSAGE;

  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!token) return "Missing reset token.";
  if (password.length < 8) return "Password must be at least 8 characters.";

  try {
    await resetPassword(token, password);
  } catch {
    return "This reset link is invalid or has expired.";
  }
  return "success";
}
