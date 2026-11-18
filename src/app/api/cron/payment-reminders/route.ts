import { sendDuePaymentReminders } from "@/server/orders/payment-reminders";

/**
 * "Complete your payment" reminders — see server/orders/payment-reminders.ts.
 *
 * Called every 30 minutes by GitHub Actions
 * (.github/workflows/payment-reminders.yml), not Vercel Cron: the Hobby plan
 * rejects any Vercel cron that runs more than once a day, and a reminder sent
 * a day late is useless — the order has expired by then.
 *
 * Same lock as the refund sweep: fails CLOSED without a real CRON_SECRET, and
 * only answers a request carrying it. This one sends email, so an open
 * endpoint would be a way to make the shop mail its customers.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 16 || secret.startsWith("your-")) {
    console.error("[cron] CRON_SECRET is unset or a placeholder — refusing payment reminders");
    return new Response("Cron not configured", { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await sendDuePaymentReminders();
  console.info("[cron] payment reminders", result);
  return Response.json({ ok: true, ...result });
}
