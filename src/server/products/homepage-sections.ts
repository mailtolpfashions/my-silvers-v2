import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/server/db";
import { listPublishedEntries } from "@/server/cms/entries";
import { isBannerLive, scheduleNow } from "@/server/cms/banners";
import {
  listCollectionEntries,
  selectCollections,
  type CollectionSummary,
} from "@/server/cms/collections";
import { getActiveCategories, type ProductListItem } from "@/server/products/search";
import type { EntryData } from "@/server/cms/types";

export type SectionKind =
  | "products"
  | "collections"
  | "banner"
  | "instagram"
  | "editorial"
  | "categoryTiles"
  | "usp";
export type ProductSource = "newest" | "bestseller" | "featured" | "category";

export type HomepageSection =
  | {
      kind: "products";
      key: string;
      title: string;
      eyebrow?: string;
      viewAllHref?: string;
      items: ProductListItem[];
    }
  | {
      kind: "collections";
      key: string;
      title: string;
      eyebrow?: string;
      viewAllHref?: string;
      items: CollectionSummary[];
    }
  | {
      kind: "banner";
      key: string;
      title: string;
      eyebrow?: string;
      image: string;
      link?: string;
    }
  | { kind: "instagram"; key: string; title: string; eyebrow?: string }
  /** Asymmetric image + copy split. The storytelling beat between grids. */
  | {
      kind: "editorial";
      key: string;
      title: string;
      eyebrow?: string;
      body?: string;
      image?: string;
      ctaLabel?: string;
      ctaHref?: string;
      /** Which side the image sits on, so consecutive blocks can alternate. */
      imageSide: "left" | "right";
    }
  /** Round category pills — the fastest route into the catalogue. */
  | {
      kind: "categoryTiles";
      key: string;
      title: string;
      eyebrow?: string;
      items: Array<{ id: string; name: string; slug: string; image: string | null }>;
    }
  /** The 925/BIS/hallmark craft story, as editable claims rather than fixed copy. */
  | {
      kind: "usp";
      key: string;
      title: string;
      eyebrow?: string;
      items: Array<{ icon?: string; title?: string; text?: string }>;
    };

const MAX_LIMIT = 12;

/**
 * The clock, inside a cached scope. Banner start/end windows are therefore only
 * as precise as the `scheduled` cacheLife profile in next.config.ts — a banner
 * can linger past its end time by up to that revalidate period.
 */

type SectionSpec = {
  type?: unknown;
  title?: unknown;
  eyebrow?: unknown;
  source?: unknown;
  categorySlug?: unknown;
  featuredOnly?: unknown;
  bannerPosition?: unknown;
  limit?: unknown;
  viewAllHref?: unknown;
  isActive?: unknown;
  // editorial
  body?: unknown;
  image?: unknown;
  ctaLabel?: unknown;
  ctaHref?: unknown;
  imageSide?: unknown;
  // usp
  items?: unknown;
};

/** A banner is live only when active and inside its scheduled window. */
const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v : undefined;

/** Clamped — `limit` is an editable CMS number field. */
function clampLimit(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(MAX_LIMIT, Math.max(1, Math.trunc(n))) : fallback;
}

function productWhere(source: ProductSource, categorySlug?: string) {
  // Matches searchProducts: sold-out pieces never appear in a listing.
  const base = { isActive: true, stock: { gt: 0 } };
  switch (source) {
    case "bestseller":
      return { ...base, isBestseller: true };
    case "featured":
      return { ...base, isFeatured: true };
    case "category":
      return { ...base, category: { slug: categorySlug ?? "" } };
    case "newest":
    default:
      return base;
  }
}

/**
 * The CMS reads shared across sections. Fetched once per page render — both
 * lists used to be re-queried inside every section that needed them.
 */
type SectionContext = {
  banners: Awaited<ReturnType<typeof listPublishedEntries>>;
  collections: Awaited<ReturnType<typeof listCollectionEntries>>;
  now: Date;
};

async function resolveOne(
  spec: SectionSpec,
  index: number,
  ctx: SectionContext
): Promise<HomepageSection | null> {
  const kind = (str(spec.type) ?? "products") as SectionKind;
  const key = `${kind}-${index}`;
  const eyebrow = str(spec.eyebrow);
  const viewAllHref = str(spec.viewAllHref);

  if (kind === "instagram") {
    return { kind, key, title: str(spec.title) ?? "", eyebrow };
  }

  if (kind === "editorial") {
    // Needs something to say; an image alone is what the banner type is for.
    const title = str(spec.title);
    if (!title) return null;
    return {
      kind,
      key,
      title,
      eyebrow,
      body: str(spec.body),
      image: str(spec.image),
      ctaLabel: str(spec.ctaLabel),
      ctaHref: str(spec.ctaHref),
      imageSide: str(spec.imageSide) === "right" ? "right" : "left",
    };
  }

  if (kind === "categoryTiles") {
    const categories = await getActiveCategories();
    const items = categories
      .filter((c) => c.image)
      .slice(0, clampLimit(spec.limit, 6))
      .map((c) => ({ id: c.id, name: c.name, slug: c.slug, image: c.image }));
    // Every tile needs artwork, so a catalogue with no category images renders
    // nothing rather than a row of empty circles.
    if (items.length === 0) return null;
    return { kind, key, title: str(spec.title) ?? "", eyebrow, items };
  }

  if (kind === "usp") {
    const items = Array.isArray(spec.items)
      ? (spec.items as Array<Record<string, unknown>>)
          .map((it) => ({ icon: str(it.icon), title: str(it.title), text: str(it.text) }))
          .filter((it) => it.title || it.text)
      : [];
    if (items.length === 0) return null;
    return { kind, key, title: str(spec.title) ?? "", eyebrow, items };
  }

  if (kind === "banner") {
    const position = str(spec.bannerPosition) ?? "homepage-mid";
    const { banners: entries, now } = ctx;

    const match = entries.find((entry) => {
      const d = entry.data as Record<string, unknown>;
      return str(d.position) === position && isBannerLive(d, now) && str(d.image);
    });

    // No live banner for this position — render nothing rather than a gap.
    if (!match) return null;

    const d = match.data as Record<string, unknown>;
    return {
      kind,
      key,
      title: str(spec.title) ?? str(d.title) ?? "",
      eyebrow,
      image: str(d.image)!,
      link: str(d.link),
    };
  }

  if (kind === "collections") {
    const items = selectCollections(ctx.collections, {
      featuredOnly: spec.featuredOnly === true,
      take: clampLimit(spec.limit, 3),
    });
    if (items.length === 0) return null;
    return { kind, key, title: str(spec.title) ?? "", eyebrow, viewAllHref, items };
  }

  const source = (str(spec.source) ?? "newest") as ProductSource;
  const items = await getSectionProducts(
    source,
    str(spec.categorySlug),
    clampLimit(spec.limit, 8)
  );
  if (items.length === 0) return null;

  return {
    kind: "products",
    key,
    title: str(spec.title) ?? "",
    eyebrow,
    viewAllHref,
    items,
  };
}

/**
 * The product query behind a `products` section, cached on its own narrow key
 * (source + category + count) rather than as part of the whole section list —
 * that list is keyed by an arbitrary CMS JSON blob and would never hit.
 *
 * Returns plain serializable rows: Prisma Decimals are stringified here so the
 * cache entry holds no class instances.
 */
async function getSectionProducts(
  source: ProductSource,
  categorySlug: string | undefined,
  take: number
): Promise<ProductListItem[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("products");
  cacheTag(`products:${source}`);
  if (categorySlug) cacheTag(`products:category:${categorySlug}`);

  const products = await prisma.product.findMany({
    where: productWhere(source, categorySlug),
    include: { category: true },
    orderBy: { createdAt: "desc" },
    take,
  });

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    price: p.price.toString(),
    compareAtPrice: p.compareAtPrice?.toString() ?? null,
    images: p.images,
    isBestseller: p.isBestseller,
    isFeatured: p.isFeatured,
    stock: p.stock,
    categoryName: p.category.name,
  }));
}

/**
 * Resolves the homepage's configured sections. Type, heading, eyebrow, item
 * count, "view all" target AND the order all come from the CMS — there is no
 * code-level default, so an unconfigured homepage renders no sections rather
 * than content nobody can edit. `prisma db seed` creates a starter entry.
 */
export async function resolveHomepageSections(
  data: EntryData | undefined
): Promise<HomepageSection[]> {
  const specs = (Array.isArray(data?.sections) ? (data.sections as SectionSpec[]) : []).filter(
    (s) => s.isActive !== false
  );

  // Fetch the shared CMS lists once, and only when a section actually wants
  // them — a homepage with no banner section shouldn't query banners at all.
  const wantsBanners = specs.some((s) => str(s.type) === "banner");
  const wantsCollections = specs.some((s) => str(s.type) === "collections");

  const [banners, collections, now] = await Promise.all([
    wantsBanners ? listPublishedEntries("banner", 20) : Promise.resolve([]),
    wantsCollections ? listCollectionEntries() : Promise.resolve([]),
    // One timestamp for the whole render, so two sections can't disagree about
    // whether a scheduled banner is live. Cached because reading the clock is
    // non-deterministic — see the `scheduled` profile in next.config.ts.
    scheduleNow(),
  ]);

  const ctx: SectionContext = { banners, collections, now };

  const resolved = await Promise.all(specs.map((spec, i) => resolveOne(spec, i, ctx)));
  // Drop sections with nothing to show — an empty heading looks broken.
  return resolved.filter((s): s is HomepageSection => s !== null);
}
