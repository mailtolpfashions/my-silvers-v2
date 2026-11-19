/**
 * The look of every MY Silvers email.
 *
 * The emails used to be three or four bare <p> lines — no logo, no photos, no
 * price breakdown, no address — next to Flipkart's confirmation in the same
 * inbox. An order email is the first thing a shopper reads after paying a
 * shop they may never have bought from before, so it has to look like a shop.
 *
 * ── Email HTML is not web HTML ──────────────────────────────────────────────
 * Gmail strips most <style> rules and all external CSS; Outlook renders with
 * Word. So: tables for layout, every style inline, widths in px, no flexbox,
 * no CSS variables, no web fonts (system stack only). Colours are the
 * storefront's "925" tokens written out as hex — see globals.css.
 *
 * Everything that varies is escaped by the caller with `esc()`; the builders
 * here take ready HTML.
 */

export const C = {
  page: "#f7f3ec", // --half-white, warm ivory
  card: "#ffffff",
  hairline: "#e8e1d5",
  muted: "#655c50", // --grey
  ink: "#2e2822", // --half-black
  black: "#15110d",
  oxide: "#2f4858", // the one accent — links that must be found
  saving: "#1f7a3d",
  alert: "#b42318",
} as const;

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

export function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** The shop's registered details — the footer trust line. From the GST certificate. */
const SHOP_ADDRESS = "No. 75, Perumal Kovil Street, Chengam, Tiruvannamalai, Tamil Nadu 606701";
const GSTIN = "33AMKPY0103A1ZN";

export type Help = { whatsapp?: string; email: string };

/**
 * The page: ivory ground, a white 600px card, the logo and a status label at
 * the top (the way Flipkart puts "Order Placed" in its header), the body, and
 * a footer with help and the shop's registered details.
 *
 * `preheader` is the grey preview line inbox lists show after the subject —
 * left empty, Gmail fills it with the logo's alt text.
 */
export function renderEmail(opts: {
  baseUrl: string;
  preheader: string;
  label?: string;
  body: string;
  help?: Help;
  /** Staff emails: no shopper footer. */
  internal?: boolean;
  /** Where the logo is fetched from — the live site even in development, since a mail client can't reach localhost. */
  assetUrl?: string;
}): string {
  const { baseUrl, preheader, label, body, help, internal } = opts;
  const assetUrl = opts.assetUrl ?? baseUrl;
  // Replies DO reach a person: the From address is send-only, but every
  // shopper email sets Reply-To to support@ (a real Zoho inbox). So no
  // "do not reply to this message" line — it would turn away customers who
  // can actually be answered. Naming the address says where replies land.
  const helpLine = help
    ? `Need help? Just reply to this email or write to <a href="mailto:${help.email}" style="color:${C.oxide};font-weight:600;text-decoration:none">${help.email}</a>${
        help.whatsapp
          ? `, or <a href="https://wa.me/${help.whatsapp}" style="color:${C.oxide};font-weight:600;text-decoration:none">WhatsApp us</a>`
          : ""
      } — we read every message.`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>MY Silvers</title>
</head>
<body style="margin:0;padding:0;background:${C.page};font-family:${FONT};color:${C.ink};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${C.card};border:1px solid ${C.hairline};border-radius:12px;overflow:hidden">
  <tr>
    <td style="padding:20px 28px;border-bottom:1px solid ${C.hairline}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle"><a href="${baseUrl}" style="text-decoration:none"><img src="${assetUrl}/logo.png" width="74" height="45" alt="MY Silvers" style="display:block;border:0;height:45px;width:74px"></a></td>
        ${label ? `<td valign="middle" align="right" style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${C.muted};font-weight:600">${esc(label)}</td>` : ""}
      </tr></table>
    </td>
  </tr>
  <tr><td style="padding:28px">${body}</td></tr>
  ${
    internal
      ? ""
      : `<tr><td style="padding:20px 28px;background:${C.page};border-top:1px solid ${C.hairline};font-size:13px;line-height:20px;color:${C.muted}">
      ${helpLine ? `<p style="margin:0 0 12px">${helpLine}</p>` : ""}
      <p style="margin:0 0 12px;color:${C.ink};font-weight:600">925 sterling silver &middot; Made in India</p>
      <p style="margin:0;font-size:12px;line-height:18px">MY Silvers &middot; ${SHOP_ADDRESS}<br>GSTIN ${GSTIN} &middot; <a href="${baseUrl}" style="color:${C.muted}">${baseUrl.replace(/^https?:\/\//, "")}</a></p>
    </td></tr>`
  }
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** A solid, bulletproof button (a padded table cell, so Outlook draws it too). */
export function button(href: string, text: string, kind: "primary" | "secondary" = "primary"): string {
  const primary = kind === "primary";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;margin:0 8px 8px 0"><tr>
<td style="border-radius:8px;background:${primary ? C.black : C.card};border:1px solid ${C.black}">
<a href="${href}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:${primary ? "#ffffff" : C.black};text-decoration:none;border-radius:8px">${esc(text)}</a>
</td></tr></table>`;
}

export function heading(text: string): string {
  return `<h1 style="margin:0 0 8px;font-size:22px;line-height:30px;font-weight:700;color:${C.black}">${text}</h1>`;
}

export function para(html: string, extra = ""): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:23px;color:${C.ink};${extra}">${html}</p>`;
}

export function sectionTitle(text: string): string {
  return `<p style="margin:24px 0 10px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${C.muted};font-weight:600">${esc(text)}</p>`;
}

/** A soft ivory box — the delivery address, a gift message, a notice. */
export function box(html: string, tone: "neutral" | "alert" = "neutral"): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="padding:14px 16px;background:${tone === "alert" ? "#fdf3f2" : C.page};border-radius:8px;border-left:3px solid ${tone === "alert" ? C.alert : C.hairline};font-size:14px;line-height:21px;color:${C.ink}">${html}</td>
</tr></table>`;
}

/** Label / value rows: "Order number  MYS-000014". */
export function facts(rows: Array<[string, string]>): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:3px 0;font-size:14px;color:${C.muted};width:140px" valign="top">${esc(k)}</td><td style="padding:3px 0;font-size:14px;color:${C.ink};font-weight:600" valign="top">${v}</td></tr>`
    )
    .join("")}</table>`;
}

/**
 * The four-step tracker under the greeting — Confirmed, Shipped, Out for
 * delivery, Delivered — with `done` steps filled. The customer's flow (owner's
 * decision, Nov 2026); "Packed" is the shop's own step and is not shown here. Drawn as table cells, which every
 * client renders; no images, so it survives "images off".
 */
export function progress(done: number): string {
  const steps = ["Confirmed", "Shipped", "Out for delivery", "Delivered"];
  const cells = steps
    .map((s, i) => {
      const on = i < done;
      return `<td align="center" valign="top" style="width:25%;padding:0 2px">
  <div style="height:4px;border-radius:2px;background:${on ? C.oxide : C.hairline}"></div>
  <div style="padding-top:8px;font-size:12px;font-weight:${on ? 700 : 500};color:${on ? C.oxide : C.muted}">${on ? "&#10003; " : ""}${s}</div>
</td>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 4px"><tr>${cells}</tr></table>`;
}

/**
 * A product photograph at email size. Cloudinary uploads are fetched as a
 * small JPEG padded on white — some clients still drop WebP/AVIF, which is
 * what an unpinned Cloudinary URL may answer with. Anything else is used as-is.
 */
export function thumb(src: string | null | undefined, size = 72): string {
  if (!src) {
    return `<div style="width:${size}px;height:${size}px;border-radius:8px;background:${C.page}"></div>`;
  }
  const m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/.exec(src);
  const url = m ? `${m[1]}w_${size * 2},h_${size * 2},c_pad,b_white,f_jpg,q_auto/${m[2]}` : src;
  return `<img src="${esc(url)}" width="${size}" height="${size}" alt="" style="display:block;border:0;border-radius:8px;width:${size}px;height:${size}px;object-fit:cover;background:${C.page}">`;
}
