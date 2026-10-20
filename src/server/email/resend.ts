import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const from = process.env.RESEND_FROM_EMAIL ?? "MY Silvers <orders@mysilvers.in>";
/**
 * Where a customer's "Reply" goes. The From address is a send-only identity on
 * Resend — nothing receives mail for it — so without this every reply to an
 * order confirmation bounced. support@ is a real mailbox (Zoho).
 */
const replyTo = process.env.RESEND_REPLY_TO || "support@mysilvers.in";

type SendPayload = Parameters<typeof resend.emails.send>[0];

/**
 * Sends, and THROWS if Resend refuses.
 *
 * ⚠️  The Resend SDK does not throw on an API error — it RESOLVES with
 * `{ data: null, error }`. Every caller here was written as though it threw:
 * each wraps the send in try/catch and logs the failure. So a bad API key, an
 * unverified domain or a rate limit was silently swallowed, and the logs said
 * nothing. That is exactly how a wrong production key went unnoticed until a
 * password reset never arrived.
 *
 * Converting it to an exception makes those existing catches do their job.
 * `kind` names the email in the message, so a log line says which one failed.
 */
async function deliver(kind: string, payload: SendPayload): Promise<void> {
  const { error } = await resend.emails.send(payload);
  if (error) {
    throw new Error(`Resend refused the ${kind} email: ${error.name}: ${error.message}`);
  }
}
const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

export async function sendOrderConfirmationEmail(params: {
  to: string;
  orderNumber: string;
  totalAmount: number | string;
}) {
  await deliver("order-confirmation", {
    from,
    replyTo,
    to: params.to,
    subject: `Order confirmed: ${params.orderNumber}`,
    html: `
      <p>Thank you for your order!</p>
      <p>Your order <strong>${params.orderNumber}</strong> has been confirmed.</p>
      <p>Total: ₹${params.totalAmount}</p>
      <p><a href="${appBaseUrl}/account/orders">View your orders</a></p>
    `,
  });
}

export async function sendPasswordResetEmail(to: string, rawToken: string) {
  const resetUrl = `${appBaseUrl}/reset-password?token=${rawToken}`;
  await deliver("password-reset", {
    from,
    replyTo,
    to,
    subject: "Reset your MY Silvers password",
    html: `
      <p>We received a request to reset your password.</p>
      <p><a href="${resetUrl}">Click here to reset your password</a></p>
      <p>This link expires in 30 minutes. If you didn't request this, you can ignore this email.</p>
    `,
  });
}

/**
 * "It's back" — the one email this shop sends that the recipient asked for by
 * name, about one specific piece.
 *
 * Deliberately short and single-purpose. Someone who registered for a sold-out
 * ring wants a link to that ring, not a newsletter — and the piece may not stay
 * in stock for long, which is the whole reason they asked.
 */
export async function sendBackInStockEmail(params: {
  to: string;
  productName: string;
  productSlug: string;
  size?: string;
}) {
  const url = `${appBaseUrl}/products/${params.productSlug}`;
  const sized = params.size ? ` (size ${params.size})` : "";

  await deliver("back-in-stock", {
    from,
    replyTo,
    to: params.to,
    subject: `Back in stock: ${params.productName}`,
    html: `
      <p>The piece you asked about is back.</p>
      <p><strong>${params.productName}</strong>${sized}</p>
      <p><a href="${url}">View it</a></p>
      <p style="color:#655c50;font-size:13px">
        We're sending this once, because you asked to be told about this piece.
        You are not subscribed to anything.
      </p>
    `,
  });
}
