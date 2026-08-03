import { prisma } from "@/server/db";
import { listPublishedEntries } from "@/server/cms/entries";
import { getCollections, type CollectionSummary } from "@/server/cms/collections";
import type { ProductListItem } from "@/server/products/search";
import type { EntryData } from "@/server/cms/types";

export type SectionKind = "products" | "collections" | "banner" | "instagram";
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
  | { kind: "instagram"; key: string; title: string; eyebrow?: string };

const MAX_LIMIT = 12;

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
};

/** A banner is live only when active and inside its scheduled window. */
function isBannerLive(data: Record<string, unknown>, now: Date): boolean {
  if (data.isActive === false) return false;
  const startsAt = str(data.startsAt);
  const endsAt = str(data.endsAt);
  if (startsAt && new Date(startsAt) > now) return false;
  if (endsAt && new Date(endsAt) < now) return false;
  return true;
}

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

async function resolveOne(spec: SectionSpec, index: number): Promise<HomepageSection | null> {
  const kind = (str(spec.type) ?? "products") as SectionKind;
  const key = `${kind}-${index}`;
  const eyebrow = str(spec.eyebrow);
  const viewAllHref = str(spec.viewAllHref);

  if (kind === "instagram") {
    return { kind, key, title: str(spec.title) ?? "", eyebrow };
  }

  if (kind === "banner") {
    const position = str(spec.bannerPosition) ?? "homepage-mid";
    const entries = await listPublishedEntries("banner", 20);
    const now = new Date();

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
    const items = await getCollections({
      featuredOnly: spec.featuredOnly === true,
      take: clampLimit(spec.limit, 3),
    });
    if (items.length === 0) return null;
    return { kind, key, title: str(spec.title) ?? "", eyebrow, viewAllHref, items };
  }

  const source = (str(spec.source) ?? "newest") as ProductSource;
  const products = await prisma.product.findMany({
    where: productWhere(source, str(spec.categorySlug)),
    include: { category: true },
    orderBy: { createdAt: "desc" },
    take: clampLimit(spec.limit, 8),
  });
  if (products.length === 0) return null;

  return {
    kind: "products",
    key,
    title: str(spec.title) ?? "",
    eyebrow,
    viewAllHref,
    items: products.map((p) => ({
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
    })),
  };
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

  const resolved = await Promise.all(specs.map(resolveOne));
  // Drop sections with nothing to show — an empty heading looks broken.
  return resolved.filter((s): s is HomepageSection => s !== null);
}
