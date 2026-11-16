/**
 * WhatsApp links, in one place.
 *
 * wa.me wants the number as bare digits WITH the country code — no "+", no
 * spaces, no dashes. People type numbers every possible way ("98765 43210",
 * "+91-98765-43210", "098765 43210"), so everything that builds a link goes
 * through normaliseIndianMobile first.
 */

/**
 * "919876543210" from any common way of writing an Indian mobile number, or ""
 * when it isn't one. Empty is a real answer: callers hide the link rather than
 * ship one that opens WhatsApp to a stranger or to nobody.
 */
export function normaliseIndianMobile(raw: string | null | undefined): string {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  // Indian mobiles start 6–9 after the country code.
  return /^91[6-9]\d{9}$/.test(digits) ? digits : "";
}

/** A wa.me link, optionally with the first message already typed. */
export function whatsappLink(number: string, text?: string): string {
  return text ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : `https://wa.me/${number}`;
}
