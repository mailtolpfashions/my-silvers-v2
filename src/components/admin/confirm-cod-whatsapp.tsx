import { MessageCircle } from "lucide-react";
import { normaliseIndianMobile, whatsappLink } from "@/lib/whatsapp";

/**
 * "Confirm on WhatsApp" — the manual COD check, in one tap.
 *
 * Opens WhatsApp to the customer's delivery number with the confirmation
 * message already typed. This is the shop's fake-COD filter until order volume
 * justifies an OTP service: message, ship on a YES, and cancel as "Suspicious
 * order" if nobody answers. It opens on whatever device the admin is using, so
 * it sends from the business number only where WhatsApp Business is the
 * account signed in there.
 *
 * Renders nothing when the address has no usable Indian mobile — a link to
 * nobody is worse than no link.
 */
export function ConfirmCodWhatsapp({
  phone,
  fullName,
  orderNumber,
  total,
}: {
  phone: string | undefined;
  fullName: string | undefined;
  orderNumber: string;
  /** Formatted, e.g. "₹1,499". */
  total: string;
}) {
  const number = normaliseIndianMobile(phone);
  if (!number) return null;

  const firstName = fullName?.trim().split(/\s+/)[0];
  const text =
    `Hi${firstName ? ` ${firstName}` : ""}! Thanks for your MY Silvers order ${orderNumber} ` +
    `(${total}, cash on delivery). Please reply YES to confirm and we'll get it ready to ship 🙏`;

  return (
    <a
      href={whatsappLink(number, text)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm whitespace-nowrap transition-colors hover:bg-muted"
    >
      <MessageCircle className="size-3.5" aria-hidden />
      Confirm on WhatsApp
    </a>
  );
}
