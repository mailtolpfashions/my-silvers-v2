"use server";

import { z } from "zod";
import { prisma } from "@/server/db";
import { checkIpRateLimit, RATE_LIMIT_MESSAGE } from "@/server/rate-limit/limiter";
import {
  isDisposableEmail,
  DISPOSABLE_EMAIL_MESSAGE,
} from "@/server/auth/disposable-email";

const emailSchema = z.string().trim().email().max(200);

export async function subscribeNewsletterAction(
  _prevState: string | undefined,
  formData: FormData
): Promise<string | undefined> {
  if (!(await checkIpRateLimit("newsletter"))) {
    return RATE_LIMIT_MESSAGE;
  }

  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return "Please enter a valid email address.";
  const email = parsed.data.toLowerCase();

  if (await isDisposableEmail(email)) return DISPOSABLE_EMAIL_MESSAGE;

  // Idempotent — re-subscribing a previously unsubscribed email just
  // reactivates it; already-active subscriptions are a friendly no-op.
  await prisma.newsletterSubscriber.upsert({
    where: { email },
    update: { active: true },
    create: { email },
  });

  return "subscribed";
}
