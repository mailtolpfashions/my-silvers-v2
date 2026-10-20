import { getProductReviews } from "@/server/products/reviews";
import { getStoreSettings } from "@/server/settings/store-settings";

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
 *
 * The same rule governs `hasMerchantReturnPolicy` and the `deliveryTime` inside
 * `shippingDetails`, which arrived later and are the two nodes most likely to
 * tempt someone into a default. Both come from store settings, where zero means
 * "the shop has not stated this", and both are omitted whole rather than filled
 * with a sensible-looking 7 or 30. Google renders a return window directly in
 * the search result: a number invented here is a promise the shop is then held
 * to by a shopper who read it there.
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
 * `OfferShippingDetails` for a product, from the configured shipping rate.
 *
 * ⚠️  The rate quoted is the flat charge, NOT zero, even though orders above
 * the free-delivery threshold ship free. `shippingRate` is a single
 * MonetaryAmount with nowhere to hang a threshold, so one of the two numbers
 * has to be the one published — and it has to be the higher one. Quoting free
 * delivery to a shopper who then pays ₹49 at checkout is the failure that
 * matters; quoting ₹49 to one who pays nothing is a pleasant surprise. The
 * threshold itself is still shown on the cart, where it can be explained.
 *
 * `deliveryTime` appears only when all four day counts are set. A dispatch or
 * transit estimate is a promise, and a partially-configured one — "dispatched
 * in 0 days" — is a worse promise than none.
 */
function shippingDetails(settings: {
  shippingChargePaise: number;
  handlingTimeMinDays: number;
  handlingTimeMaxDays: number;
  transitTimeMinDays: number;
  transitTimeMaxDays: number;
}) {
  const {
    shippingChargePaise,
    handlingTimeMinDays,
    handlingTimeMaxDays,
    transitTimeMinDays,
    transitTimeMaxDays,
  } = settings;

  const hasEstimate =
    handlingTimeMinDays > 0 &&
    handlingTimeMaxDays > 0 &&
    transitTimeMinDays > 0 &&
    transitTimeMaxDays > 0;

  return {
    "@type": "OfferShippingDetails",
    shippingRate: {
      "@type": "MonetaryAmount",
      // Rupees, not paise — schema.org money is in the currency's major unit.
      value: (shippingChargePaise / 100).toFixed(2),
      currency: "INR",
    },
    // The shop ships within India only.
    shippingDestination: { "@type": "DefinedRegion", addressCountry: "IN" },
    ...(hasEstimate
      ? {
          deliveryTime: {
            "@type": "ShippingDeliveryTime",
            handlingTime: {
              "@type": "QuantitativeValue",
              minValue: handlingTimeMinDays,
              maxValue: handlingTimeMaxDays,
              unitCode: "DAY",
            },
            transitTime: {
              "@type": "QuantitativeValue",
              minValue: transitTimeMinDays,
              maxValue: transitTimeMaxDays,
              unitCode: "DAY",
            },
          },
        }
      : {}),
  };
}

/**
 * `MerchantReturnPolicy`, or nothing at all.
 *
 * Returns null on an unset window, and that is the whole contract — see the
 * note at the top of this file. Google prints "30-day returns" straight into
 * the search result, so a default here would be the shop making a promise in
 * public that nobody in the shop agreed to.
 *
 * ⚠️  `returnFees` is emitted only for free returns. When the shopper pays the
 * postage, Google wants `returnShippingFeesAmount` alongside it and the shop
 * has no such figure configured — so the field is omitted rather than paired
 * with a guessed amount. Adding a `returnShippingFeePaise` setting is what it
 * would take to state it; until then, unspecified is the honest answer.
 */
function merchantReturnPolicy(settings: {
  returnWindowDays: number;
  returnShippingPaidBy: "customer" | "merchant";
}) {
  if (settings.returnWindowDays <= 0) return null;

  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "IN",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: settings.returnWindowDays,
    ...(settings.returnShippingPaidBy === "merchant"
      ? { returnFees: "https://schema.org/FreeReturn" }
      : {}),
  };
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
  // Both self-served rather than passed in, for the reason in this component's
  // doc comment: it must be impossible to call with someone else's numbers.
  // getStoreSettings is cached and already read on the cart and checkout, so
  // this is a cache hit on every product page.
  const [{ averageRating, count }, settings] = await Promise.all([
    getProductReviews(product.id),
    getStoreSettings(),
  ]);
  const url = `${SITE_URL}/products/${product.slug}`;
  const returnPolicy = merchantReturnPolicy(settings);

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
            // What lifts this from a plain Product result to a merchant listing
            // — the format that carries price, delivery and returns into the
            // search result itself.
            shippingDetails: shippingDetails(settings),
            ...(returnPolicy ? { hasMerchantReturnPolicy: returnPolicy } : {}),
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
  modifiedAt,
}: {
  title: string;
  slug: string;
  excerpt?: string;
  image?: string;
  author?: string;
  publishedAt?: string;
  modifiedAt?: string;
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
          // Freshness is a real input to whether an answer engine quotes a
          // page. Omitted when it would only repeat datePublished — an
          // untouched post claiming a modification is noise.
          ...(modifiedAt && modifiedAt !== publishedAt
            ? { dateModified: modifiedAt }
            : {}),
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

/**
 * FAQPage, emitted only from /faq.
 *
 * ⚠️  Deliberately NOT emitted from product pages, even though they render a
 * subset of the same questions. Google requires FAQ markup to describe the page
 * it sits on, a product page already emits Product, and the same Q&A repeated
 * across 120 URLs is duplicate structured data — which is a manual-action risk
 * rather than extra coverage.
 *
 * `acceptedAnswer.text` takes the answer's HTML: the FAQPage spec allows a
 * limited set of tags there, and the CMS rich text is sanitized on write and
 * again on render. Emitting stripped plain text instead would drop the links in
 * answers that point at the returns and shipping pages.
 */
export function FaqJsonLd({
  items,
}: {
  items: Array<{ question: string; answer: string }>;
}) {
  // No questions means no markup at all. An empty mainEntity is a FAQPage claim
  // about a page with no FAQ on it.
  if (items.length === 0) return null;

  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: items.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      }}
    />
  );
}
