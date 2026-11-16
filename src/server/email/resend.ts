import { Resend } from "resend";
import { formatINR } from "@/lib/format";

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
/**
 * The address every link in every email starts with.
 *
 * ⚠️  Production once kept APP_BASE_URL pointing at the old demo deployment
 * after that deployment was deleted, so every "View your order", track-order
 * and admin "Open the order" link in a real customer's email led to Vercel's
 * 404 page. A link in an email can't be fixed after it is sent, so in
 * production we never trust a localhost or *.vercel.app address: those fall
 * back to the shop's own domain, and the log says so.
 */
const SHOP_URL = "https://www.mysilvers.in";
export function resolveAppBaseUrl(
  raw: string | undefined,
  isProduction: boolean
): string {
  const url = (raw ?? "").trim().replace(/\/+$/, "");
  if (!isProduction) return url || "http://localhost:3000";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    // empty or malformed — falls through to the shop's domain
  }
  if (!host || host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app")) {
    console.error(
      `APP_BASE_URL is ${url ? `"${url}"` : "not set"} in production; email links use ${SHOP_URL} instead. Fix it in Vercel's environment variables.`
    );
    return SHOP_URL;
  }
  return url;
}
const appBaseUrl = resolveAppBaseUrl(
  process.env.APP_BASE_URL,
  process.env.VERCEL_ENV === "production"
);

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
      <p>Total: ${formatINR(params.totalAmount)}</p>
      <p><a href="${orderUrl}">View your order</a></p>
      <p>You can also track it any time at <a href="${appBaseUrl}/track-order">${appBaseUrl.replace(/^https?:\/\//, "")}/track-order</a> with your order number and the mobile number you ordered with.</p>
    `,
  });
}

/**
 * "Your order has been cancelled" — sent when the SHOP cancels (the Cancel
 * order button). A customer who cancels themselves sees it happen on screen;
 * one whose order the shop cancelled would otherwise find out only when
 * nothing arrived.
 *
 * `why` is what the customer is told, never the internal reason: an order
 * cancelled as "Suspicious order" must not say so to the person who placed it,
 * so those (and "Other") say nothing and invite a reply instead.
 *
 * `refund` describes the money for a paid order: "sent" when Razorpay accepted
 * the refund, "pending" when it failed and sits in the retry queue — the
 * customer is owed it either way, and should hear that.
 */
export async function sendOrderCancelledEmail(params: {
  to: string;
  name: string | null;
  orderNumber: string;
  orderId: string;
  confirmationToken: string | null;
  why: "customer" | "stock" | null;
  refund: { amount: number | string; state: "sent" | "pending" } | null;
}) {
  const orderUrl = params.confirmationToken
    ? `${appBaseUrl}/orders/${params.orderId}?ot=${params.confirmationToken}`
    : `${appBaseUrl}/account/orders/${params.orderId}`;
  const firstName = params.name?.trim().split(/\s+/)[0];
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hello,";
  const reason =
    params.why === "customer"
      ? `As you asked, we have cancelled your order <strong>${params.orderNumber}</strong>.`
      : params.why === "stock"
        ? `We're sorry — an item in your order <strong>${params.orderNumber}</strong> has just gone out of stock, so we have had to cancel it.`
        : `Your order <strong>${params.orderNumber}</strong> has been cancelled.`;
  const refund = !params.refund
    ? ""
    : params.refund.state === "sent"
      ? `<p>We have refunded <strong>${formatINR(params.refund.amount)}</strong> to the account you paid from. Banks usually take 5–7 working days to show it.</p>`
      : `<p>Your refund of <strong>${formatINR(params.refund.amount)}</strong> is being processed and will reach the account you paid from. Banks usually take 5–7 working days to show it once it is sent.</p>`;

  await deliver("order-cancelled", {
    from,
    replyTo,
    to: params.to,
    subject: `Order cancelled: ${params.orderNumber}`,
    html: `
      <p>${greeting}</p>
      <p>${reason}</p>
      ${refund}
      <p><a href="${orderUrl}">View your order</a></p>
      <p>Questions? Just reply to this email — we read every one.</p>
      <p>— MY Silvers</p>
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

/**
 * "New order" — to the shop's OWNER(s), the moment an order is paid (or a COD
 * order is placed). A paid order once went unnoticed for want of exactly this.
 * Plain and scannable on a phone: what, how much, who, where, and one button.
 */
export async function sendNewOrderAlertEmail(params: {
  to: string[];
  orderId: string;
  orderNumber: string;
  total: number;
  cod: boolean;
  customer: string;
  city: string | null;
  items: Array<{ name: string; quantity: number; size: string | null }>;
}) {
  const amount = formatINR(params.total);
  const url = `${appBaseUrl}/admin/orders/${params.orderId}`;
  const lines = params.items
    .map(
      (i) =>
        `<li>${escapeHtml(i.name)}${i.size ? ` (size ${escapeHtml(i.size)})` : ""} × ${i.quantity}</li>`
    )
    .join("");
  await deliver("new-order-alert", {
    from,
    to: params.to,
    subject: `🛍️ New order ${params.orderNumber} — ${amount}${params.cod ? " (COD)" : ""}`,
    html: `
      <p><strong>New order ${params.orderNumber}</strong> — ${amount}, ${params.cod ? "cash on delivery" : "paid online"}.</p>
      <p>${escapeHtml(params.customer)}${params.city ? `, ${escapeHtml(params.city)}` : ""}</p>
      <ul>${lines}</ul>
      <p><a href="${url}">Open the order and ship it</a></p>
    `,
  });
}

/**
 * A staff invite or an owner-sent password reset. Links to the ordinary
 * /reset-password page, which sets the password and signs nothing in.
 */
export async function sendStaffAccessEmail(params: {
  to: string;
  name: string | null;
  rawToken: string;
  roleLabel: string;
  kind: "invite" | "reset";
  days: number;
}) {
  const url = `${appBaseUrl}/reset-password?token=${params.rawToken}`;
  const hello = params.name ? `Hi ${escapeHtml(params.name.split(" ")[0])},` : "Hi,";
  await deliver(params.kind === "invite" ? "staff-invite" : "staff-reset", {
    from,
    replyTo,
    to: params.to,
    subject:
      params.kind === "invite"
        ? `You've been added to the MY Silvers admin`
        : "Set a new password for the MY Silvers admin",
    html: `
      <p>${hello}</p>
      <p>${
        params.kind === "invite"
          ? `You've been given <strong>${escapeHtml(params.roleLabel)}</strong> access to the MY Silvers admin. Choose a password to get started:`
          : "The shop owner has sent you a link to set a new password:"
      }</p>
      <p><a href="${url}">Set my password</a></p>
      <p>Then sign in at <a href="${appBaseUrl}/login">${appBaseUrl.replace(/^https?:\/\//, "")}/login</a> with this email. The link works for ${params.days} days.</p>
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
