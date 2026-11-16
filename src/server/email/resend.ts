import { Resend } from "resend";
import { formatINR } from "@/lib/format";
import {
  renderEmail,
  button,
  heading,
  para,
  sectionTitle,
  box,
  facts,
  progress,
  thumb,
  esc,
  C,
} from "@/server/email/layout";
import {
  loadOrderEmailData,
  itemsTable,
  priceSummary,
  addressBlock,
  formatOrderDate,
  type OrderEmailData,
} from "@/server/email/order-email";

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
/** A mail client can't fetch from localhost, so the logo always comes from a public address. */
const assetUrl = /localhost|127\.0\.0\.1/.test(appBaseUrl) ? SHOP_URL : appBaseUrl;

/** The page around every email — see email/layout.ts. */
function page(opts: Omit<Parameters<typeof renderEmail>[0], "baseUrl" | "assetUrl">): string {
  return renderEmail({ ...opts, baseUrl: appBaseUrl, assetUrl });
}

const SUPPORT_HELP = { email: "support@mysilvers.in" };

/** Where a shopper's own order lives: the tokenised page for a guest, the account page otherwise. */
function orderLink(orderId: string, token: string | null): string {
  return token
    ? `${appBaseUrl}/orders/${orderId}?ot=${token}`
    : `${appBaseUrl}/account/orders/${orderId}`;
}

const site = appBaseUrl.replace(/^https?:\/\//, "");

/**
 * "Order confirmed" — the email a shopper reads right after paying (or placing
 * a COD order), so it is the fullest one: photos of what they bought, the
 * price breakdown with the saving stated, when it should arrive, where it is
 * going, and how to reach us.
 *
 * Takes only the order id and loads the rest itself (email/order-email.ts),
 * so the two callers — COD at creation, online at payment — can't drift.
 *
 * A guest's "View your order" goes to the tokenised order page: a guest has no
 * password, so /account/orders would be a sign-in page they can't get past.
 */
export async function sendOrderConfirmationEmail(params: { to: string; orderId: string }) {
  const d = await loadOrderEmailData(params.orderId);
  if (!d) throw new Error(`order ${params.orderId} not found for the confirmation email`);
  await deliver("order-confirmation", {
    from,
    replyTo,
    to: params.to,
    subject: `Order confirmed: ${d.orderNumber}`,
    html: orderConfirmationHtml(d),
  });
}

/** The confirmation's HTML, apart from sending — so it can be previewed. */
export function orderConfirmationHtml(d: OrderEmailData): string {
  const count = d.items.reduce((n, i) => n + i.quantity, 0);
  const intro = d.cod
    ? `Thank you for shopping with MY Silvers! Your order is confirmed and we're getting it ready. Please keep <strong>${formatINR(d.total)}</strong> ready to pay when it arrives.`
    : "Thank you for shopping with MY Silvers! We've received your payment and your order is confirmed — we're getting it ready.";
  const rows: Array<[string, string]> = [
    ["Order number", esc(d.orderNumber)],
    ["Placed on", formatOrderDate(d.createdAt)],
    ["Payment", d.cod ? "Cash on delivery" : "Paid online"],
  ];
  if (d.delivery) rows.push(["Expected delivery", `<span style="color:${C.saving}">${d.delivery}</span>`]);

  const body = [
    heading(d.firstName ? `Hi ${esc(d.firstName)},` : "Hello,"),
    para(intro),
    facts(rows),
    progress(1),
    `<div style="padding-top:20px">${button(orderLink(d.id, d.confirmationToken), "View your order")}${button(`${appBaseUrl}/track-order`, "Track order", "secondary")}</div>`,
    sectionTitle(`Your order (${count} ${count === 1 ? "item" : "items"})`),
    itemsTable(d.items),
    priceSummary(d),
    sectionTitle("Delivering to"),
    box(addressBlock(d.address)),
    d.isGift && d.giftMessage ? sectionTitle("Your gift message") + box(`&ldquo;${esc(d.giftMessage)}&rdquo;`) : "",
    `<p style="margin:20px 0 0;font-size:13px;line-height:20px;color:${C.muted}">Once it ships, you can follow it any time at <a href="${appBaseUrl}/track-order" style="color:${C.oxide}">${site}/track-order</a> with your order number and mobile number.</p>`,
  ].join("");

  return page({
    preheader: `${d.orderNumber} is confirmed — ${formatINR(d.total)}${d.delivery ? `, arriving ${d.delivery}` : ""}.`,
    label: "Order confirmed",
    body,
    help: d.help,
  });
}

/**
 * "Your order is on its way" — sent once, when the courier is assigned
 * (assignAwbAction): that is when the order turns shipped and has a tracking
 * number to give. Leads with the tracking link, because that is the one thing
 * a shopper opens this email for.
 */
export async function sendOrderShippedEmail(orderId: string) {
  const d = await loadOrderEmailData(orderId);
  if (!d) throw new Error(`order ${orderId} not found for the shipped email`);
  await deliver("order-shipped", {
    from,
    replyTo,
    to: d.email,
    subject: `Shipped: your order ${d.orderNumber} is on its way`,
    html: orderShippedHtml(d),
  });
}

/** The shipped email's HTML, apart from sending — so it can be previewed. */
export function orderShippedHtml(d: OrderEmailData): string {
  const trackHref = d.trackingUrl || `${appBaseUrl}/track-order`;
  const rows: Array<[string, string]> = [["Order number", esc(d.orderNumber)]];
  if (d.courierName) rows.push(["Courier", esc(d.courierName)]);
  if (d.trackingNumber) rows.push(["Tracking number", esc(d.trackingNumber)]);
  if (d.arrival) rows.push(["Expected delivery", `<span style="color:${C.saving}">${d.arrival}</span>`]);

  const body = [
    heading(d.firstName ? `Good news, ${esc(d.firstName)}!` : "Good news!"),
    para(
      d.cod
        ? `Your order has been packed and handed to the courier. Please keep <strong>${formatINR(d.total)}</strong> ready to pay when it arrives.`
        : "Your order has been packed and handed to the courier — it's on its way to you."
    ),
    facts(rows),
    progress(3),
    `<div style="padding-top:20px">${button(trackHref, "Track your parcel")}${button(orderLink(d.id, d.confirmationToken), "View your order", "secondary")}</div>`,
    sectionTitle("In this parcel"),
    itemsTable(d.items),
    sectionTitle("Delivering to"),
    box(addressBlock(d.address)),
    `<p style="margin:20px 0 0;font-size:13px;line-height:20px;color:${C.muted}">Tracking can take a few hours to show the first update after pickup. You can also follow it at <a href="${appBaseUrl}/track-order" style="color:${C.oxide}">${site}/track-order</a> with your order number and mobile number. Please check the parcel when it arrives — if anything is damaged or wrong, record an unboxing video and tell us within 48 hours.</p>`,
  ].join("");

  return page({
    preheader: `${d.orderNumber} is on its way${d.arrival ? ` — expected ${d.arrival}` : ""}.`,
    label: "Shipped",
    body,
    help: d.help,
  });
}

/**
 * "Delivered" — sent once, when the order first turns delivered (the
 * Shiprocket webhook, or the owner marking it by hand from a pre-delivery
 * status). The moment to ask for a review, point to the care guide, and
 * restate the 48-hour window for reporting damage — it starts now.
 */
export async function sendOrderDeliveredEmail(orderId: string) {
  const d = await loadOrderEmailData(orderId);
  if (!d) throw new Error(`order ${orderId} not found for the delivered email`);
  await deliver("order-delivered", {
    from,
    replyTo,
    to: d.email,
    subject: `Delivered: your order ${d.orderNumber} has arrived`,
    html: orderDeliveredHtml(d),
  });
}

/** The delivered email's HTML, apart from sending — so it can be previewed. */
export function orderDeliveredHtml(d: OrderEmailData): string {
  const orderHref = orderLink(d.id, d.confirmationToken);
  const body = [
    heading(d.firstName ? `It's here, ${esc(d.firstName)}!` : "Your order has arrived!"),
    para(
      `Your order <strong>${esc(d.orderNumber)}</strong> has been delivered. We hope you love wearing it as much as we enjoyed making it ready for you.`
    ),
    progress(4),
    `<div style="padding-top:20px">${button(orderHref, "Rate & review")}${button(`${appBaseUrl}/p/care-guide`, "Silver care guide", "secondary")}</div>`,
    para(
      "A quick review helps other shoppers choose — and tells us what you think.",
      `font-size:13px;color:${C.muted};margin-top:4px`
    ),
    sectionTitle("What you received"),
    itemsTable(d.items),
    sectionTitle("Something not right?"),
    box(
      `If anything arrived damaged, defective or wrong, tell us <strong>within 48 hours</strong> with an unboxing video and we'll make it right — a refund or an exchange, your choice. Reply to this email or use <a href="${orderHref}" style="color:${C.oxide};font-weight:600">Request a return</a> on your order.`
    ),
    `<p style="margin:20px 0 0;font-size:13px;line-height:20px;color:${C.muted}">Keep your silver bright: store it dry, in a zip-lock bag or a closed box, and put it on after perfume and lotion, not before.</p>`,
  ].join("");

  return page({
    preheader: `${d.orderNumber} has been delivered — we hope you love it.`,
    label: "Delivered",
    body,
    help: d.help,
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
  const d = await loadOrderEmailData(params.orderId);
  const firstName = params.name?.trim().split(/\s+/)[0];
  const number = `<strong>${esc(params.orderNumber)}</strong>`;
  const reason =
    params.why === "customer"
      ? `As you asked, we have cancelled your order ${number}.`
      : params.why === "stock"
        ? `We're sorry — an item in your order ${number} has just gone out of stock, so we have had to cancel it.`
        : `Your order ${number} has been cancelled.`;
  const refund = !params.refund
    ? ""
    : box(
        params.refund.state === "sent"
          ? `<strong>Refund of ${formatINR(params.refund.amount)} sent</strong><br>It goes back to the account you paid from. Banks usually take 5–7 working days to show it.`
          : `<strong>Refund of ${formatINR(params.refund.amount)} in progress</strong><br>It will reach the account you paid from. Banks usually take 5–7 working days to show it once it is sent.`
      );

  const body = [
    heading(firstName ? `Hi ${esc(firstName)},` : "Hello,"),
    para(reason),
    refund,
    d ? sectionTitle("What was in the order") + itemsTable(d.items) : "",
    `<div style="padding-top:20px">${button(orderLink(params.orderId, params.confirmationToken), "View your order")}${button(`${appBaseUrl}/products`, "Continue shopping", "secondary")}</div>`,
  ].join("");

  await deliver("order-cancelled", {
    from,
    replyTo,
    to: params.to,
    subject: `Order cancelled: ${params.orderNumber}`,
    html: page({
      preheader: `Your order ${params.orderNumber} has been cancelled${params.refund ? " and refunded" : ""}.`,
      label: "Order cancelled",
      body,
      help: d?.help ?? SUPPORT_HELP,
    }),
  });
}

/**
 * "Confirm your email" — sent at sign-up. Until it is clicked, the account
 * still works but does not show orders placed as a GUEST with this address;
 * see server/auth/email-verification.ts for why.
 */
export async function sendEmailVerificationEmail(to: string, rawToken: string, name: string | null) {
  const url = `${appBaseUrl}/verify-email?token=${rawToken}`;
  const first = name?.trim().split(/\s+/)[0];
  await deliver("email-verification", {
    from,
    replyTo,
    to,
    subject: "Confirm your email for MY Silvers",
    html: page({
      preheader: "One tap to confirm your email and finish setting up your account.",
      label: "Welcome",
      help: SUPPORT_HELP,
      body: [
        heading(first ? `Welcome, ${esc(first)}!` : "Welcome to MY Silvers!"),
        para("Please confirm this is your email address:"),
        `<div style="padding:4px 0 16px">${button(url, "Confirm my email")}</div>`,
        para("Once confirmed, any orders you placed as a guest with this email will show in your account too."),
        para("This link works for 7 days. If you didn't create an account, you can ignore this email.", `font-size:13px;color:${C.muted}`),
      ].join(""),
    }),
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
    html: page({
      preheader: "Turn your guest orders into a MY Silvers account.",
      label: "Your account",
      help: SUPPORT_HELP,
      body: [
        heading("Set your password"),
        para("You've shopped with us before as a guest. Set a password to turn this email into a MY Silvers account — your past orders will be waiting in it."),
        `<div style="padding:4px 0 16px">${button(url, "Set my password")}</div>`,
        para("This link expires in 30 minutes. If you didn't ask for this, you can ignore this email.", `font-size:13px;color:${C.muted}`),
      ].join(""),
    }),
  });
}

/**
 * "New order" — to the shop's OWNER(s), the moment an order is paid (or a COD
 * order is placed). A paid order once went unnoticed for want of exactly this.
 * Built for packing from a phone: what to pick (photos and sizes), where it
 * goes (full address and phone), how much, and one button.
 *
 * `orderId: "test"` is the Settings page's test send — there is no order to
 * load, so it is drawn from the params alone.
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
  const d = params.orderId === "test" ? null : await loadOrderEmailData(params.orderId);

  const body = [
    heading(`New order ${esc(params.orderNumber)}`),
    para(
      `<strong style="font-size:20px;color:${C.black}">${amount}</strong> &nbsp;&middot;&nbsp; ${
        params.cod
          ? `<span style="color:${C.alert};font-weight:600">Cash on delivery — collect ${amount}</span>`
          : `<span style="color:${C.saving};font-weight:600">Paid online</span>`
      }`
    ),
    `<div style="padding:4px 0 8px">${button(url, "Open the order and ship it")}</div>`,
    sectionTitle("To pack"),
    itemsTable(d ? d.items : params.items),
    d ? priceSummary(d) : "",
    sectionTitle("Ship to"),
    box(
      d
        ? addressBlock(d.address)
        : `<strong>${esc(params.customer)}</strong>${params.city ? `<br>${esc(params.city)}` : ""}`
    ),
    d?.isGift
      ? sectionTitle("Gift") +
        box(`Gift order${d.giftWrap > 0 ? " — gift wrap paid" : ""}${d.giftMessage ? `<br>Message: &ldquo;${esc(d.giftMessage)}&rdquo;` : ""}`)
      : "",
    d ? para(`Customer email: ${esc(d.email)}`, `font-size:13px;color:${C.muted};margin-top:16px`) : "",
  ].join("");

  await deliver("new-order-alert", {
    from,
    to: params.to,
    subject: `🛍️ New order ${params.orderNumber} — ${amount}${params.cod ? " (COD)" : ""}`,
    html: page({
      preheader: `${params.customer}${params.city ? `, ${params.city}` : ""} — ${params.items.map((i) => `${i.name} × ${i.quantity}`).join(", ")}`,
      label: params.cod ? "New COD order" : "New paid order",
      body,
      internal: true,
    }),
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
  const first = params.name?.trim().split(/\s+/)[0];
  await deliver(params.kind === "invite" ? "staff-invite" : "staff-reset", {
    from,
    replyTo,
    to: params.to,
    subject:
      params.kind === "invite"
        ? `You've been added to the MY Silvers admin`
        : "Set a new password for the MY Silvers admin",
    html: page({
      preheader: params.kind === "invite" ? "Choose a password to get started." : "A link to set a new password.",
      label: "Admin access",
      internal: true,
      body: [
        heading(first ? `Hi ${esc(first)},` : "Hi,"),
        para(
          params.kind === "invite"
            ? `You've been given <strong>${esc(params.roleLabel)}</strong> access to the MY Silvers admin. Choose a password to get started:`
            : "The shop owner has sent you a link to set a new password:"
        ),
        `<div style="padding:4px 0 16px">${button(url, "Set my password")}</div>`,
        para(
          `Then sign in at <a href="${appBaseUrl}/login" style="color:${C.oxide}">${site}/login</a> with this email. The link works for ${params.days} days.`,
          `font-size:13px;color:${C.muted}`
        ),
      ].join(""),
    }),
  });
}

export async function sendPasswordResetEmail(to: string, rawToken: string) {
  const resetUrl = `${appBaseUrl}/reset-password?token=${rawToken}`;
  await deliver("password-reset", {
    from,
    replyTo,
    to,
    subject: "Reset your MY Silvers password",
    html: page({
      preheader: "A link to reset your password — valid for 30 minutes.",
      label: "Your account",
      help: SUPPORT_HELP,
      body: [
        heading("Reset your password"),
        para("We received a request to reset the password for your MY Silvers account."),
        `<div style="padding:4px 0 16px">${button(resetUrl, "Reset my password")}</div>`,
        para(
          "This link expires in 30 minutes. If you didn't ask for this, you can ignore this email — your password stays as it is.",
          `font-size:13px;color:${C.muted}`
        ),
      ].join(""),
    }),
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
  image?: string | null;
}) {
  const url = `${appBaseUrl}/products/${params.productSlug}`;
  const sized = params.size ? ` (size ${esc(params.size)})` : "";

  await deliver("back-in-stock", {
    from,
    replyTo,
    to: params.to,
    subject: `Back in stock: ${params.productName}`,
    html: page({
      preheader: `${params.productName} is back — pieces like this don't stay long.`,
      label: "Back in stock",
      help: SUPPORT_HELP,
      body: [
        heading("It's back!"),
        para("The piece you asked us about is in stock again."),
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px"><tr>
          <td valign="middle" style="padding-right:16px">${thumb(params.image, 96)}</td>
          <td valign="middle" style="font-size:16px;line-height:23px;font-weight:600;color:${C.black}">${esc(params.productName)}${sized}</td>
        </tr></table>`,
        `<div style="padding-bottom:16px">${button(url, "View it now")}</div>`,
        para(
          "Most of our pieces are one of a kind, so it may not stay long. We're sending this once, because you asked to be told about this piece — you are not subscribed to anything.",
          `font-size:13px;color:${C.muted}`
        ),
      ].join(""),
    }),
  });
}
