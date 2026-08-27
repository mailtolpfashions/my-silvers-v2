import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const from = process.env.RESEND_FROM_EMAIL ?? "MY Silvers <orders@mysilvers.in>";
const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

export async function sendOrderConfirmationEmail(params: {
  to: string;
  orderNumber: string;
  totalAmount: number | string;
}) {
  await resend.emails.send({
    from,
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
  await resend.emails.send({
    from,
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

  await resend.emails.send({
    from,
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
