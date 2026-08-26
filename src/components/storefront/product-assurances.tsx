import Link from "next/link";
import { BadgeCheck, RotateCcw, Truck } from "lucide-react";

/**
 * The three things a shopper wants settled before spending ₹4,000 on silver.
 *
 * ── Why this sits directly under the buy buttons ────────────────────────────
 * It is the highest-converting element on an Indian product page and the site
 * had none of it. A shopper deciding between this shop and a marketplace is
 * weighing exactly three risks — is it real silver, what if it does not suit
 * me, and when does it arrive — and every competitor answers all three within
 * a thumb's reach of the buy button. Answering them four screens down in an
 * accordion is answering them after the decision.
 *
 * ── ⚠️  It states no numbers, and that is deliberate ────────────────────────
 * There is a standing note in product-info-sections.tsx:
 *
 *     UNRESOLVED: the homepage trust bar says 15-day returns; the old product
 *     page said 7-day. Neither is asserted anywhere now. Confirm the real
 *     policy with the business before writing this.
 *
 * So this does not say "7-day returns" or "free shipping over ₹999". It names
 * the assurance and links to the page that holds the real terms. A wrong number
 * here is a promise the shop has to honour, and the last two versions of this
 * page contradicted each other.
 *
 * Replace the links with stated terms the day the business confirms them — that
 * is a strictly better version of this component, not a different one.
 *
 * The hallmark line is the exception: 925 sterling is a fact about the metal,
 * asserted in the site's own metadata, and stamped on the piece itself.
 */
export function ProductAssurances({
  returnsHref,
  shippingHref,
}: {
  /** Omitted when the policy page is unpublished — never link into a 404. */
  returnsHref?: string;
  shippingHref?: string;
}) {
  return (
    <ul className="mt-6 grid gap-px border-y bg-border lg:max-w-xl">
      <Assurance icon={<BadgeCheck className="size-4" aria-hidden />}>
        <span className="font-medium text-foreground">925 BIS hallmarked</span> — assayed
        sterling, stamped on the piece
      </Assurance>

      {returnsHref && (
        <Assurance icon={<RotateCcw className="size-4" aria-hidden />}>
          <Link href={returnsHref} className="font-medium text-foreground underline-offset-4 hover:underline">
            Returns &amp; exchanges
          </Link>{" "}
          — read the terms before you buy
        </Assurance>
      )}

      {shippingHref && (
        <Assurance icon={<Truck className="size-4" aria-hidden />}>
          <Link href={shippingHref} className="font-medium text-foreground underline-offset-4 hover:underline">
            Shipping &amp; delivery
          </Link>{" "}
          — charges and timelines across India
        </Assurance>
      )}
    </ul>
  );
}

/** One row. Hairline-separated by the parent's gap-px over a border fill. */
function Assurance({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 bg-background py-3 text-sm text-muted-foreground">
      {/* Oxide, because this is the accent's job: the one colour on the page
          that means "this is worth reading". */}
      <span className="mt-0.5 shrink-0 text-[var(--oxide)]">{icon}</span>
      <span className="text-pretty">{children}</span>
    </li>
  );
}
