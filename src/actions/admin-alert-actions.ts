"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/server/auth/require-role";
import { logActivity } from "@/server/activity/log";
import { sendNewOrderAlertEmail } from "@/server/email/resend";
import {
  cleanAlertEmails,
  getOrderAlertEmails,
  MAX_ALERT_EMAILS,
  resolveAlertRecipients,
  saveOrderAlertEmails,
} from "@/server/settings/order-alerts";

export type AlertActionResult = { ok: true; message?: string } | { ok: false; error: string };

/** Owner only — who receives the "New order" email. */
export async function saveOrderAlertEmailsAction(emails: string[]): Promise<AlertActionResult> {
  const session = await requireOwner();
  if (!Array.isArray(emails)) return { ok: false, error: "Invalid list." };

  const typed = emails.map((e) => String(e).trim()).filter(Boolean);
  const clean = cleanAlertEmails(typed);
  const rejected = typed.filter((e) => !clean.includes(e.toLowerCase()));
  if (rejected.length > 0 && typed.length <= MAX_ALERT_EMAILS) {
    return { ok: false, error: `This doesn't look like an email address: ${rejected[0]}` };
  }
  if (typed.length > MAX_ALERT_EMAILS) {
    return { ok: false, error: `Up to ${MAX_ALERT_EMAILS} addresses.` };
  }

  const before = await getOrderAlertEmails();
  const saved = await saveOrderAlertEmails(clean);
  await logActivity(session, {
    action: "settings.alerts",
    target: { type: "settings", id: "orderAlerts" },
    summary: saved.length
      ? `Set new-order alert emails: ${saved.join(", ")}`
      : "Cleared the new-order alert list (alerts go to the owner)",
    details: { from: before, to: saved },
  });
  revalidatePath("/admin/settings");
  return { ok: true };
}

/**
 * Sends a sample alert to whoever would get a real one right now — the quickest
 * way to find out whether alerts arrive at all (sender domain, spam folder)
 * without waiting for a customer to order.
 */
export async function sendTestOrderAlertAction(): Promise<AlertActionResult> {
  await requireOwner();
  const { to, fromList } = await resolveAlertRecipients();
  if (to.length === 0) return { ok: false, error: "No one to send to — add an email first." };
  try {
    await sendNewOrderAlertEmail({
      to,
      orderId: "test",
      orderNumber: "TEST-ORDER",
      total: 1499,
      cod: false,
      customer: "Test customer (this is a test)",
      city: "Chennai",
      items: [{ name: "Sample silver ring", quantity: 1, size: "12" }],
    });
  } catch (err) {
    console.error("[owner-alert] test email failed", err);
    return {
      ok: false,
      error:
        "The email could not be sent. The email service refused it — check the sending domain and API key in Resend.",
    };
  }
  return {
    ok: true,
    message: `Test sent to ${to.join(", ")}${fromList ? "" : " (the owner account)"}. Check spam if it doesn't arrive in a minute.`,
  };
}
