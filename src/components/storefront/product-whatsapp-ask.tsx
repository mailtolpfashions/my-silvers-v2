import { MessageCircle } from "lucide-react";
import { getContactSettings } from "@/server/settings/store-settings";
import { whatsappLink } from "@/lib/whatsapp";

const SITE = "https://www.mysilvers.in";

/**
 * "Ask about this piece on WhatsApp", under the buy buttons.
 *
 * Why it exists: buying silver online in India, the questions that stop a
 * purchase — is it real 925, will it fit, can I see it on a hand — get asked
 * on WhatsApp, of a person. Answering them at the buy button is a trust cue,
 * not a distraction, so long as it stays visibly SECONDARY: a quiet bordered
 * link, never a filled button competing with Buy now.
 *
 * The message arrives pre-typed with the piece's name and link, so the shop
 * knows which one is meant without a back-and-forth. No price in it: an offer
 * can change the price after the message is sent, and the link shows the
 * current one.
 *
 * Renders nothing until the owner sets a WhatsApp number in admin Settings.
 */
export async function ProductWhatsappAsk({ name, slug }: { name: string; slug: string }) {
  const { whatsappNumber } = await getContactSettings();
  if (!whatsappNumber) return null;

  const href = whatsappLink(
    whatsappNumber,
    `Hi MY Silvers! I have a question about the ${name}: ${SITE}/products/${slug}`
  );

  return (
    <div className="mt-4 lg:max-w-xl">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-11 w-full items-center justify-center gap-2 border text-sm transition-colors hover:bg-muted"
      >
        <MessageCircle className="size-4" aria-hidden />
        Ask about this piece on WhatsApp
      </a>
      <p className="mt-1.5 text-center text-xs text-muted-foreground">
        Questions about size, purity or gifting? We&apos;re happy to help.
      </p>
    </div>
  );
}
