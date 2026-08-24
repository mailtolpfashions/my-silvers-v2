import Link from "next/link";
import { getPublishedEntry } from "@/server/cms/entries";
import { getFaqItems } from "@/server/cms/faq";
import { Expandable } from "@/components/storefront/expandable";
import { RichText } from "@/components/storefront/cms/rich-text";
import { ContentGap } from "@/components/storefront/content-gap";

/**
 * The expandable information block under the product actions.
 *
 * ── Where the copy comes from ────────────────────────────────────────────────
 * "Details & measurements" is per-product and comes from the Product row —
 * purity, weight, material, dimensions, SKU. Everything below it is identical
 * for every piece in the shop, so it comes from a CMS singleton called
 * `product-info` rather than from fields duplicated onto 122 products.
 *
 * That split is the whole point of the design. Putting a care guide on the
 * Product model would mean an admin retyping it on every new piece, and would
 * mean a returns-policy change requiring a bulk edit of the catalogue. One
 * entry, edited once, appears on every product page.
 *
 * ── What it does when the entry does not exist ───────────────────────────────
 * Renders the per-product row and nothing else. It does NOT fall back to
 * hardcoded copy: materials, hallmarking, care and returns are business claims,
 * and inventing them in JSX is how a site ends up promising a 7-day return in
 * one place and 15 days in another — which is exactly what this codebase
 * already did. See the note in the product page.
 */
export async function ProductInfoSections({
  product,
}: {
  product: {
    purity: string;
    weight: { toString(): string } | null;
    material: string | null;
    dimensions: string | null;
    sku: string;
  };
}) {
  const [entry, faqItems] = await Promise.all([
    getPublishedEntry("product-info"),
    getFaqItems(),
  ]);
  const data = (entry?.data ?? {}) as {
    materials?: string;
    care?: string;
    shippingReturns?: string;
  };

  /**
   * Only the questions an editor flagged for product pages.
   *
   * The whole FAQ would be wrong here: a shopper on a product page is deciding
   * about THIS piece, and burying "how do I track my order" under it pushes the
   * sizing and hallmark answers they actually need out of view. The flag lives
   * on each question in the CMS — see the `faq` type in prisma/seed.ts.
   */
  const productFaqs = faqItems.filter((item) => item.showOnProductPage);

  const specs: Array<[string, string]> = [
    ["Purity", product.purity],
    ...(product.weight ? ([["Weight", `${product.weight.toString()}g`]] as Array<[string, string]>) : []),
    ...(product.material ? ([["Material", product.material]] as Array<[string, string]>) : []),
    ...(product.dimensions ? ([["Dimensions", product.dimensions]] as Array<[string, string]>) : []),
    ["SKU", product.sku],
  ];

  return (
    <div className="mt-10 border-t">
      {/* Open by default: measurements are the one thing a shopper reliably
          wants before buying jewellery online, and a closed row means everyone
          pays a click for it. */}
      <Expandable title="Details & measurements" defaultOpen>
        <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-2.5">
          {specs.map(([term, value]) => (
            <div key={term} className="contents">
              <dt className="text-muted-foreground">{term}</dt>
              <dd className="text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </Expandable>

      {data.materials ? (
        <Expandable title="Materials & hallmarking">
          <RichText html={data.materials} className="prose-sm" />
        </Expandable>
      ) : (
        <ContentGap
          label="Materials & hallmarking"
          detail="Shown on every product page. Nothing renders for shoppers until it is written — hallmark wording is a business claim and is not invented here."
          where="CMS → Product information → Materials & hallmarking"
        />
      )}

      {data.care ? (
        <Expandable title="Care">
          <RichText html={data.care} className="prose-sm" />
        </Expandable>
      ) : (
        <ContentGap
          label="Care"
          detail="How to keep the piece looking new. Shown on every product page."
          where="CMS → Product information → Care"
        />
      )}

      {data.shippingReturns ? (
        <Expandable title="Shipping & returns">
          <RichText html={data.shippingReturns} className="prose-sm" />
        </Expandable>
      ) : (
        <ContentGap
          label="Shipping & returns"
          detail="UNRESOLVED: the homepage trust bar says 15-day returns; the old product page said 7-day. Neither is asserted anywhere now. Confirm the real policy with the business before writing this."
          where="CMS → Product information → Shipping & returns"
        />
      )}

      {/* Last row on purpose. The rows above answer "what is this piece"; the
          FAQ answers "what about buying it", which is the question that comes
          after. No ContentGap when empty — an unflagged FAQ is a deliberate
          editorial choice, not missing content, and the /faq page already
          reports when nothing at all is written. */}
      {productFaqs.length > 0 && (
        <Expandable title="Common questions">
          <dl className="space-y-5">
            {productFaqs.map((item) => (
              <div key={item.question}>
                <dt className="font-medium text-foreground">{item.question}</dt>
                <dd className="mt-1">
                  <RichText html={item.answer} className="prose-sm" />
                </dd>
              </div>
            ))}
          </dl>
          {/* No FAQPage JSON-LD here — see the note on FaqJsonLd. This link is
              what connects the subset to the full list. */}
          <Link
            href="/faq"
            className="mt-5 inline-block text-sm text-foreground underline underline-offset-4"
          >
            All questions
          </Link>
        </Expandable>
      )}
    </div>
  );
}

/** Matches the collapsed rows' height so the column doesn't jump as it streams. */
export function ProductInfoSectionsSkeleton() {
  return (
    <div className="mt-10 border-t" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-[57px] border-b" />
      ))}
    </div>
  );
}
