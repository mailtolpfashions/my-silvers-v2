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
