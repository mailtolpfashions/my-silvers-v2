import { getActiveCategories } from "@/server/products/search";
import { getCollections } from "@/server/cms/collections";
import { listPublishedEntries } from "@/server/cms/entries";
import { PRICE_BUCKETS } from "@/lib/price-buckets";

/**
 * The navigation model: five "worlds" rather than a flat list of ten peers.
 *
 * The old nav put Rings, Collections and Journal at identical weight, which
 * communicates "here is our stock". This groups the catalogue the way a shopper
 * actually arrives at it — by what they came for, not by how the database is
 * organised.
 *
 * Everything here resolves from data that already exists: categories are
 * Category rows, collections are published CMS entries, and the tag and price
 * links use the SUPPORTED query params on /products. Nothing invents a route.
 *
 * On tag links specifically: `?q=` runs Postgres full-text search, and the
 * generated searchVector includes Product.tags at weight C (see the init
 * migration). So `?q=oxidised` genuinely returns the oxidised pieces without
 * adding a tag parameter to searchProducts — which keeps this a
 * presentation-layer change, as intended.
 */

export type NavLink = { label: string; href: string };

export type NavColumn = { heading: string; links: NavLink[] };

export type NavTile = {
  image?: string | null;
  title: string;
  href: string;
  linkLabel: string;
};

export type NavWorld = {
  label: string;
  /** Where the top-level label itself navigates. Always a real page. */
  href: string;
  /**
   * Extra path prefixes this world owns for the purposes of the active state.
   *
   * A category page lives at /category/rings, which is nowhere near the
   * Jewellery world's own /products href — so without this, browsing a category
   * highlighted nothing at all and the header lost its sense of place.
   */
  activePaths?: string[];
  /** Absent means no panel — the label is a plain link (Journal, Our Story). */
  columns?: NavColumn[];
  /** Shown at the right of the panel. Collections use several; others use one. */
  tiles?: NavTile[];
};

/** Turns a price bucket into the exact query params the listing already reads. */
function priceHref(min?: number, max?: number): string {
  const params = new URLSearchParams();
  if (min) params.set("minPrice", String(min));
  if (max) params.set("maxPrice", String(max));
  return `/products?${params.toString()}`;
}

/**
 * Finish tags that exist in the catalogue today. Kept as an explicit list
 * rather than derived from a tag census, because a census would surface every
 * stray tag an admin ever typed — including gemstone names and category
 * duplicates — and the nav is a curated surface, not a report.
 *
 * If a tag here stops matching any product the link still resolves; it just
 * lands on an empty result page. Worth a periodic check rather than a
 * per-request query on every page of the site.
 */
const FINISHES: NavLink[] = [
  { label: "Oxidised", href: "/products?q=oxidised" },
  { label: "Polished", href: "/products?q=polished" },
  { label: "Matte", href: "/products?q=matte" },
  { label: "Rhodium plated", href: "/products?q=rhodium-plated" },
  { label: "Rose gold plated", href: "/products?q=rose-gold-plated" },
];

const OCCASIONS: NavLink[] = [
  { label: "Bridal", href: "/products?q=bridal" },
  { label: "Festive", href: "/products?q=festive" },
  { label: "Party", href: "/products?q=party" },
  { label: "Office", href: "/products?q=office" },
  { label: "Everyday", href: "/products?q=everyday" },
];

/**
 * Builds the whole nav in one pass.
 *
 * Both reads are already cached — getActiveCategories for days under the
 * `categories` tag, getCollections for hours under `cms:collection` — so this
 * costs nothing per request beyond assembling the object. Identical for every
 * visitor, which is what lets the header stay out of the account island.
 */
export async function buildNav(): Promise<NavWorld[]> {
  const [categories, collections] = await Promise.all([
    getActiveCategories(),
    getCollections({ take: 6 }),
  ]);

  const categoryLinks: NavLink[] = categories.map((c) => ({
    label: c.name,
    href: `/category/${c.slug}`,
  }));

  const priceLinks: NavLink[] = PRICE_BUCKETS.map((b) => ({
    label: b.label,
    href: priceHref(b.min, b.max),
  }));

  // The panel's picture. Uses a real category image rather than a separately
  // authored asset, so the nav can never show a broken frame.
  const featured = categories.find((c) => c.image);

  const worlds: NavWorld[] = [
    {
      label: "Jewellery",
      href: "/products",
      // A category page and a product page are both "inside" Jewellery.
      activePaths: ["/category", "/products/"],
      columns: [
        { heading: "By category", links: [...categoryLinks, { label: "All jewellery", href: "/products" }] },
        { heading: "By price", links: priceLinks },
        { heading: "By finish", links: FINISHES },
      ],
      tiles: featured
        ? [
            {
              image: featured.image,
              title: featured.name,
              href: `/category/${featured.slug}`,
              linkLabel: "Discover",
            },
          ]
        : undefined,
    },
  ];

  // Only offered when something is actually published — an empty Collections
  // panel is worse than no Collections entry.
  if (collections.length > 0) {
    worlds.push({
      label: "Collections",
      href: "/collections",
      tiles: collections.slice(0, 3).map((c) => ({
        image: c.thumbnailImage,
        title: c.title,
        href: `/collections/${c.slug}`,
        linkLabel: "Explore",
      })),
      columns:
        collections.length > 3
          ? [
              {
                heading: "All collections",
                links: collections.map((c) => ({
                  label: c.title,
                  href: `/collections/${c.slug}`,
                })),
              },
            ]
          : undefined,
    });
  }

  worlds.push({
    label: "Gifting",
    // No /gifting route exists, so the label lands on the tagged listing —
    // a real page with real results rather than a 404 waiting to happen.
    href: "/products?q=gifting",
    columns: [
      { heading: "By occasion", links: OCCASIONS },
      { heading: "By budget", links: priceLinks },
    ],
    tiles: featured
      ? [
          {
            image: featured.image,
            title: "Gifts in silver",
            href: "/products?q=gifting",
            linkLabel: "Shop gifting",
          },
        ]
      : undefined,
  });

  worlds.push({ label: "Journal", href: "/blog" });
  worlds.push({ label: "Our Story", href: "/p/about" });

  return worlds;
}

/**
 * The utility row's links, filtered against what is actually published.
 *
 * The CMS-page ones are checked rather than hardcoded because two of the three
 * are aspirational: `/p/size-guide` is already linked from the product page's
 * size selector and has never been written, so hardcoding it here would put a
 * 404 in the header of every page on the site. A link that quietly does not
 * appear until someone writes the page is the right failure mode.
 *
 * `listPublishedEntries` is cached under the `cms:page` tag and invalidated on
 * publish, so authoring the page makes the link appear without a deploy.
 */
/**
 * Whether a CMS `page` entry is actually published.
 *
 * Used anywhere the UI would otherwise link to a page that has never been
 * written — the size guide being the live example. `listPublishedEntries` is
 * cached under the `cms:page` tag and invalidated on publish, so writing the
 * page makes the link appear without a deploy.
 */
export async function isPagePublished(slug: string): Promise<boolean> {
  const pages = await listPublishedEntries("page", 50);
  return pages.some((p) => p.slug === slug);
}

export async function buildUtilityLinks(): Promise<NavLink[]> {
  const pages = await listPublishedEntries("page", 50);
  const slugs = new Set(pages.map((p) => p.slug));

  const cmsLinks: NavLink[] = [
    { label: "Size guide", href: "/p/size-guide" },
    { label: "Silver care", href: "/p/care-guide" },
    { label: "Shipping", href: "/p/shipping" },
    { label: "Returns", href: "/p/returns" },
  ].filter((l) => slugs.has(l.href.replace("/p/", "")));

  // Always available — a real route, not CMS content.
  return [...cmsLinks.slice(0, 3), { label: "Track order", href: "/account/orders" }];
}
