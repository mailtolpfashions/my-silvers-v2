import { getProductReviews } from "@/server/products/reviews";

/**
 * JSON-LD for the storefront.
 *
 * ── The rule this module exists to enforce ───────────────────────────────────
 * Every value emitted here comes from the database or the CMS. Nothing is
 * invented, and nothing is emitted "for completeness" — an absent field is
 * always better than a plausible one. Structured data is a claim made to search
 * engines on the shop's behalf, and a fabricated rating or an invented returns
 * window is a claim the business did not make.
 *
 * In particular `aggregateRating` is emitted ONLY when real reviews exist. A
 * hardcoded 4.8/127 is the single most common piece of e-commerce SEO fraud and
 * a manual-action risk; a product with no reviews simply has no rating node.
 */

/** metadataBase in app/layout.tsx — kept in step by hand, it is one string. */
const SITE_URL = "https://www.mysilvers.in";

/**
 * `<script type="application/ld+json">` is the one legitimate use of
 * dangerouslySetInnerHTML in this codebase: JSON-LD must be raw text inside the
 * tag, and React would otherwise escape the quotes into &quot; and break the
 * parse. JSON.stringify output cannot contain a closing script tag unless a
 * string value does, so `<` is escaped defensively.
 */
function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

/**
 * Organization and WebSite, emitted once from the storefront layout.
 *
 * Deliberately minimal. No `telephone`, no `address`, no `foundingDate`, no
 * `sameAs` for networks the shop may not run — the only social URLs included
 * are the ones actually configured in the environment, and an unset variable
 * contributes nothing rather than a guessed profile URL.
 */
export function SiteJsonLd() {
  const socials = [
    process.env.NEXT_PUBLIC_INSTAGRAM_URL,
    process.env.NEXT_PUBLIC_FACEBOOK_URL,
    process.env.NEXT_PUBLIC_YOUTUBE_URL,
  ].filter((url): url is string => Boolean(url && url.trim()));

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "MY Silvers",
          url: SITE_URL,
          logo: `${SITE_URL}/logo.png`,
          ...(socials.length > 0 ? { sameAs: socials } : {}),
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "MY Silvers",
          url: SITE_URL,
          potentialAction: {
            "@type": "SearchAction",
            target: {
              "@type": "EntryPoint",
              urlTemplate: `${SITE_URL}/products?q={search_term_string}`,
            },
            "query-input": "required name=search_term_string",
          },
        }}
      />
    </>
  );
}

/**
 * Product + Offer + BreadcrumbList for a product page.
 *
 * Async because the rating has to be looked up: the alternative is emitting no
 * rating ever, or emitting a fake one. The query is an aggregate the review
 * section on the same page also runs — worth the duplication to keep this
 * component self-contained and impossible to call with someone else's numbers.
 */
export async function ProductJsonLd({
  product,
}: {
  product: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    shortDescription: string | null;
    sku: string;
    price: { toString(): string };
    images: string[];
    stock: number;
    material: string | null;
    purity: string;
    category: { name: string; slug: string };
  };
}) {
  const { averageRating, count } = await getProductReviews(product.id);
  const url = `${SITE_URL}/products/${product.slug}`;

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.name,
          url,
          sku: product.sku,
          ...(product.images.length > 0 ? { image: product.images } : {}),
          ...(product.description || product.shortDescription
            ? { description: product.shortDescription ?? product.description }
            : {}),
          // The catalogue is single-brand; this is the shop's own name, not an
          // invented manufacturer.
          brand: { "@type": "Brand", name: "MY Silvers" },
          category: product.category.name,
          material: product.material ?? product.purity,
          offers: {
            "@type": "Offer",
            url,
            // INR throughout — the store prices, ships and settles in rupees.
            priceCurrency: "INR",
            price: product.price.toString(),
            availability:
              product.stock > 0
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
            itemCondition: "https://schema.org/NewCondition",
          },
          // Only when it is real. See the note at the top of this file.
          ...(count > 0
            ? {
                aggregateRating: {
                  "@type": "AggregateRating",
                  ratingValue: averageRating.toFixed(1),
                  reviewCount: count,
                },
              }
            : {}),
        }}
      />
      <BreadcrumbJsonLd
        trail={[
          { name: "All jewellery", path: "/products" },
          { name: product.category.name, path: `/category/${product.category.slug}` },
          { name: product.name, path: `/products/${product.slug}` },
        ]}
      />
    </>
  );
}

/**
 * ItemList for a listing page.
 *
 * Only the server-rendered first page is described. Items appended by the
 * infinite scroll are not in the document a crawler sees, and listing them
 * would be describing content that is not there.
 */
export function ItemListJsonLd({
  items,
  name,
}: {
  items: Array<{ name: string; slug: string }>;
  name: string;
}) {
  if (items.length === 0) return null;

  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "ItemList",
        name,
        numberOfItems: items.length,
        itemListElement: items.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: item.name,
          url: `${SITE_URL}/products/${item.slug}`,
        })),
      }}
    />
  );
}

/** Article for a journal post. Dates are omitted rather than guessed. */
export function ArticleJsonLd({
  title,
  slug,
  excerpt,
  image,
  author,
  publishedAt,
}: {
  title: string;
  slug: string;
  excerpt?: string;
  image?: string;
  author?: string;
  publishedAt?: string;
}) {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: title,
          url: `${SITE_URL}/blog/${slug}`,
          ...(excerpt ? { description: excerpt } : {}),
          ...(image ? { image: [image] } : {}),
          ...(author ? { author: { "@type": "Person", name: author } } : {}),
          ...(publishedAt ? { datePublished: publishedAt } : {}),
          publisher: {
            "@type": "Organization",
            name: "MY Silvers",
            logo: { "@type": "ImageObject", url: `${SITE_URL}/logo.png` },
          },
        }}
      />
      <BreadcrumbJsonLd
        trail={[
          { name: "Journal", path: "/blog" },
          { name: title, path: `/blog/${slug}` },
        ]}
      />
    </>
  );
}

export function BreadcrumbJsonLd({
  trail,
}: {
  trail: Array<{ name: string; path: string }>;
}) {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: trail.map((crumb, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: crumb.name,
          item: `${SITE_URL}${crumb.path}`,
        })),
      }}
    />
  );
}
