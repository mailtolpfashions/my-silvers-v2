import { runUsageCheck } from "@/server/admin/usage";
import { sendUsageWarningEmail } from "@/server/email/resend";
import { resolveAlertRecipients } from "@/server/settings/order-alerts";

/**
 * The daily usage check — see server/admin/usage.ts. Called once a day by
 * GitHub Actions (.github/workflows/usage-check.yml), like the payment
 * reminders, so it doesn't use up the Hobby plan's Vercel cron.
 *
 * Reads every meter, keeps the reading for the dashboard, and emails the shop's
 * alert list when anything is at 80% or more. Same CRON_SECRET lock as the
 * other cron routes.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 16 || secret.startsWith("your-")) {
    console.error("[cron] CRON_SECRET is unset or a placeholder — refusing the usage check");
    return new Response("Cron not configured", { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { meters, warnings } = await runUsageCheck();
  let emailed = false;
  if (warnings.length > 0) {
    try {
      const { to } = await resolveAlertRecipients();
      if (to.length > 0) {
        await sendUsageWarningEmail(to, warnings);
        emailed = true;
      }
    } catch (err) {
      // Likely the email quota itself — the dashboard banner still shows it.
      console.error("[cron] usage warning email failed", err);
    }
  }
  return Response.json({
    ok: true,
    meters: meters.map((m) => ({ key: m.key, used: m.used, limit: m.limit, error: m.error ?? null })),
    warnings: warnings.map((m) => m.key),
    emailed,
  });
}
