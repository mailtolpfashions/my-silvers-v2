import Link from "next/link";
import { BadgeCheck, RotateCcw, Truck, ShieldCheck, Headset } from "lucide-react";
import { getPublishedEntry } from "@/server/cms/entries";

/**
 * The three or four things a shopper wants settled before spending on silver,
 * sitting directly under the buy button.
 *
 * ── Why it is beside the button ─────────────────────────────────────────────
 * It is the highest-converting element on an Indian product page and the site
 * had none of it. Someone choosing between this shop and a marketplace weighs
 * exactly three risks — is it real silver, what if it does not suit me, when
 * does it arrive — and every competitor answers all three within a thumb's
 * reach of the buy control. This page answered them four screens down inside an
 * accordion, which is answering them after the decision.
 *
 * ── ⚠️  Authored in the CMS, never here ─────────────────────────────────────
 * The first version of this component hardcoded its rows, and could not state
 * the one fact shoppers most want, because the codebase carries a standing
 * note in product-info-sections.tsx:
 *
 *     UNRESOLVED: the homepage trust bar says 15-day returns; the old product
 *     page said 7-day. Neither is asserted anywhere now.
 *
 * A returns window is a promise the business has to honour. It is not a
 * developer's to invent, and a shop should not need a deploy to change it. So
 * the rows live on the `product-info` singleton beside the materials and care
 * blocks that already appear on every product page — one entry, edited once,
 * applying to the whole catalogue.
 *
 * Nothing is seeded. With no rows authored this renders nothing at all, which
 * is the correct empty state: no strip is better than a strip of placeholders.
 */

/** The glyphs an editor can choose from — see the `icon` options on the type. */
const ICONS = {
  hallmark: BadgeCheck,
  returns: RotateCcw,
  shipping: Truck,
  payment: ShieldCheck,
  support: Headset,
} as const;

type IconName = keyof typeof ICONS;

type AssuranceRow = {
  label?: string;
  detail?: string;
  icon?: string;
  href?: string;
};

export async function ProductAssurances() {
  const entry = await getPublishedEntry("product-info");
  const rows = (entry?.data as { assurances?: AssuranceRow[] } | undefined)?.assurances ?? [];

  // A row with no label has nothing to say; an editor mid-edit should not put a
  // blank line on the storefront.
  const assurances = rows.filter((row) => row.label?.trim());
  if (assurances.length === 0) return null;

  return (
    <ul className="mt-6 grid gap-px border-y bg-border lg:max-w-xl">
      {assurances.map((row, i) => {
        const Icon = ICONS[row.icon as IconName] ?? BadgeCheck;
        const label = row.label!.trim();
        const detail = row.detail?.trim();

        return (
          <li
            key={`${label}-${i}`}
            className="flex items-start gap-3 bg-background py-3 text-sm text-muted-foreground"
          >
            {/* Oxide: the accent's job is marking what is worth reading, and on
                this page that is exactly these rows. */}
            <span className="mt-0.5 shrink-0 text-[var(--oxide)]">
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="text-pretty">
              {row.href ? (
                <Link
                  href={row.href}
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {label}
                </Link>
              ) : (
                <span className="font-medium text-foreground">{label}</span>
              )}
              {detail && <> — {detail}</>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
