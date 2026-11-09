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
  orderId: string;
  /**
   * Set for guest orders. A guest has no password, so the old "View your
   * orders" link to /account/orders led to a sign-in page they could not get
   * past — the tokenised order page is the only door they have.
   */
  confirmationToken: string | null;
}) {
  const orderUrl = params.confirmationToken
    ? `${appBaseUrl}/orders/${params.orderId}?ot=${params.confirmationToken}`
    : `${appBaseUrl}/account/orders/${params.orderId}`;
  await deliver("order-confirmation", {
    from,
    replyTo,
    to: params.to,
    subject: `Order confirmed: ${params.orderNumber}`,
    html: `
      <p>Thank you for your order!</p>
      <p>Your order <strong>${params.orderNumber}</strong> has been confirmed.</p>
      <p>Total: ₹${params.totalAmount}</p>
      <p><a href="${orderUrl}">View your order</a></p>
      <p>You can also track it any time at <a href="${appBaseUrl}/track-order">${appBaseUrl.replace(/^https?:\/\//, "")}/track-order</a> with your order number and the mobile number you ordered with.</p>
    `,
  });
}

/**
 * "Confirm your email" — sent at sign-up. Until it is clicked, the account
 * still works but does not show orders placed as a GUEST with this address;
 * see server/auth/email-verification.ts for why.
 */
export async function sendEmailVerificationEmail(to: string, rawToken: string, name: string | null) {
  const url = `${appBaseUrl}/verify-email?token=${rawToken}`;
  const hello = name ? `Hi ${escapeHtml(name.split(" ")[0])},` : "Hi,";
  await deliver("email-verification", {
    from,
    replyTo,
    to,
    subject: "Confirm your email for MY Silvers",
    html: `
      <p>${hello}</p>
      <p>Welcome to MY Silvers! Please confirm this is your email address:</p>
      <p><a href="${url}">Confirm my email</a></p>
      <p>Once confirmed, any orders you placed as a guest with this email will show in your account too.</p>
      <p>This link works for 7 days. If you didn't create an account, you can ignore this email.</p>
    `,
  });
}

/**
 * "Set your password" — for someone who has ordered as a guest and now wants
 * an account. Same token and page as a reset; only the words differ, because
 * "reset your password" to a person who never had one reads as a mistake.
 */
export async function sendPasswordSetupEmail(to: string, rawToken: string) {
  const url = `${appBaseUrl}/reset-password?token=${rawToken}`;
  await deliver("password-setup", {
    from,
    replyTo,
    to,
    subject: "Set your MY Silvers password",
    html: `
      <p>You've shopped with us before as a guest. Set a password to turn this email into a MY Silvers account:</p>
      <p><a href="${url}">Set my password</a></p>
      <p>Your past orders will be waiting in your account. This link expires in 30 minutes. If you didn't ask for this, you can ignore this email.</p>
    `,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
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
