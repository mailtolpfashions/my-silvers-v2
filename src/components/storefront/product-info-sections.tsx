import { getPublishedEntry } from "@/server/cms/entries";
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
  const entry = await getPublishedEntry("product-info");
  const data = (entry?.data ?? {}) as {
    materials?: string;
    care?: string;
    shippingReturns?: string;
  };

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
