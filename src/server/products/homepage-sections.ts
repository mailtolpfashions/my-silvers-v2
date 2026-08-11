import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/server/db";
import { listPublishedEntries } from "@/server/cms/entries";
import { isBannerLive, scheduleNow } from "@/server/cms/banners";
import {
  listCollectionEntries,
  selectCollections,
  type CollectionSummary,
} from "@/server/cms/collections";
import {
  getActiveCategories,
  getProductsByTag,
  toProductListItem,
  type ProductListItem,
} from "@/server/products/search";
import type { EntryData } from "@/server/cms/types";

export type SectionKind =
  | "products"
  | "collections"
  | "banner"
  | "instagram"
  | "editorial"
  | "editorialPair"
  | "story"
  | "categoryTiles"
  | "categoryPills"
  | "worldTiles"
  | "collectionSpotlight"
  | "usp";
export type ProductSource = "newest" | "bestseller" | "featured" | "category";

export type HomepageSection =
  | {
      kind: "products";
      key: string;
      title: string;
      eyebrow?: string;
      /** Optional line under the heading, rendered with --text-lead. */
      subtitle?: string;
      viewAllHref?: string;
      items: ProductListItem[];
    }
  | {
      kind: "collections";
      key: string;
      title: string;
      eyebrow?: string;
      /** Optional line under the heading, rendered with --text-lead. */
      subtitle?: string;
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
      pinnedReveal?: boolean;
    }
  | { kind: "instagram"; key: string; title: string; eyebrow?: string }
  /** Asymmetric image + copy split. The storytelling beat between grids. */
  | {
      kind: "editorial";
      key: string;
      title: string;
      eyebrow?: string;
      /** Optional line under the heading, rendered with --text-lead. */
      subtitle?: string;
      body?: string;
      image?: string;
      ctaLabel?: string;
      ctaHref?: string;
      /** Which side the image sits on, so consecutive blocks can alternate. */
      imageSide: "left" | "right";
    }
  /**
   * Two large 4:5 photographs side by side, each with a caption and an arrow
   * link beneath it. The reference site's signature block, and the thing it
   * uses instead of a product grid to move people into categories.
   *
   * No prices and no buttons by design — this is the editorial beat between
   * commerce sections.
   */
  | {
      kind: "editorialPair";
      key: string;
      /** Optional heading above the pair; the block reads fine without one. */
      title?: string;
      eyebrow?: string;
      subtitle?: string;
      items: Array<{ image: string; caption: string; linkLabel?: string; href?: string }>;
    }
  /**
   * A full-height image held under the viewport while its copy advances over
   * it. The one pinned moment on the homepage.
   *
   * Deliberately its own kind rather than a flag on `editorial`: it is a
   * different shape (full-bleed, viewport-tall, copy in stages) and giving
   * editorial a `pinned` boolean would mean one renderer branching on two
   * layouts that share only a heading.
   */
  | {
      kind: "story";
      key: string;
      title: string;
      eyebrow?: string;
      /** Each becomes one stage of copy as the section is scrolled through. */
      stages: string[];
      image?: string;
      ctaLabel?: string;
      ctaHref?: string;
      pinnedReveal?: boolean;
    }
  /** Round category pills — the fastest route into the catalogue. */
  | {
      kind: "categoryTiles";
      key: string;
      title: string;
      eyebrow?: string;
      /** Optional line under the heading, rendered with --text-lead. */
      subtitle?: string;
      items: Array<{ id: string; name: string; slug: string; image: string | null }>;
      /**
       * Editor opt-in to the pinned reveal: the section is held to the viewport
       * and uncovered as whatever is above it scrolls away. Only carried by the
       * three full-bleed kinds — see the field definition in prisma/seed.ts.
       * Whether it is HONOURED is the page's decision, not the section's: the
       * chain has to start directly under a full-bleed hero.
       */
      pinnedReveal?: boolean;
    }
  /**
   * The same categories as `categoryTiles`, drawn as a centred row of round
   * portraits with the name beneath each.
   *
   * ── Why a second kind and not a `layout` flag on categoryTiles ─────────────
   * They read from one query and carry one item shape, so a variant field is
   * the obvious first instinct. It does not work here, and the reason is
   * mechanical rather than aesthetic: `showWhen` tests exactly one field (see
   * isFieldVisible in components/cms/field-input.tsx), so it can express
   * "type is categoryTiles" but not "type is categoryTiles AND layout is
   * band". `pinnedReveal` is offered to categoryTiles, and it exists to be
   * withheld from padded blocks — an editor ticking it here would pin a row of
   * circles to the viewport and break the page. A separate kind is what keeps
   * that field off this form.
   *
   * So: full-bleed band → categoryTiles, padded pill row → this. Neither is a
   * mode of the other.
   */
  | {
      kind: "categoryPills";
      key: string;
      /** Optional; the row reads fine as unannounced doorways. */
      title?: string;
      eyebrow?: string;
      subtitle?: string;
      items: Array<{ id: string; name: string; slug: string; image: string | null }>;
    }
  /**
   * Photographic doorways in two columns whose row seam is deliberately OFFSET
   * — four curated worlds ("Wedding", "Gifting", "Everyday"), each a picture
   * with its name laid over the foot of it.
   *
   * Its own kind rather than a flag on `editorialPair`, which is the closest
   * existing block: that one is a fixed two-up with its captions BELOW the
   * photographs and an arrow link under each, and this is a staggered four-up
   * with the name ON the photograph and nothing else. They share a data shape
   * and no layout at all.
   *
   * Distinct from `categoryTiles` too, which is the same idea drawn from the
   * catalogue: that band is gapless, full-bleed, three-up and resizes under the
   * pointer, and it can only ever show real categories. This one is curated —
   * an editor picks the four and their artwork — so it can name a world the
   * category tree has no row for.
   */
  | {
      kind: "worldTiles";
      key: string;
      /** Optional; the band reads fine as four unannounced doorways. */
      title?: string;
      eyebrow?: string;
      subtitle?: string;
      items: Array<{ image: string; label: string; href?: string }>;
      /**
       * Which composition to draw.
       *
       * `row` is one row of four across the full page. `stagger` is a 2×2 in a
       * narrower block whose two columns are the same height but whose inner
       * seams are offset — the tanishq.co.in "Tanishq World" arrangement.
       *
       * A field on ONE kind rather than two kinds, because the two are the same
       * content, the same item shape and the same query — only the arrangement
       * differs, which is exactly what an editor should be able to choose. The
       * split that categoryTiles/categoryPills needed does not apply here:
       * that one existed to keep `pinnedReveal` off the padded variant's form,
       * and worldTiles is not offered pinnedReveal at all.
       *
       * A page can therefore carry both — a full-width row in one place and a
       * staggered block in another — by adding two sections.
       */
      layout: "row" | "stagger";
    }
  /**
   * A horizontal rail of collection cards, each a wide banner with three of
   * that collection's own pieces overlapping its lower edge.
   *
   * ── Distinct from `collections`, which it sits beside ───────────────────────
   * That section is a static three-up of editorial tiles: one picture, a
   * caption, a link. This one is a SCROLLING rail where each card carries
   * product photography as well as the collection's artwork — the shopper sees
   * what is actually inside a collection without opening it. Both can appear on
   * one page, and do: this was added after the existing row, not in place of it.
   *
   * Modelled on giva.co's "Latest Collections".
   */
  | {
      kind: "collectionSpotlight";
      key: string;
      title: string;
      eyebrow?: string;
      subtitle?: string;
      viewAllHref?: string;
      items: Array<{
        id: string;
        slug: string;
        title: string;
        /** Wide artwork for the card. Never empty — a card without one is dropped. */
        banner: string;
        /**
         * A few pieces from the collection. May be EMPTY: a collection whose
         * productTag is unset resolves to nothing, and the card then renders as
         * a banner alone rather than being dropped.
         */
        products: Array<{ id: string; slug: string; name: string; image: string }>;
      }>;
    }
  /** The 925/BIS/hallmark craft story, as editable claims rather than fixed copy. */
  | {
      kind: "usp";
      key: string;
      title: string;
      eyebrow?: string;
      /** Optional line under the heading, rendered with --text-lead. */
      subtitle?: string;
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
  subtitle?: unknown;
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
  // categoryTiles | story | banner
  pinnedReveal?: unknown;
  // worldTiles
  layout?: unknown;
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
  const subtitle = str(spec.subtitle);
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
      subtitle,
      body: str(spec.body),
      image: str(spec.image),
      ctaLabel: str(spec.ctaLabel),
      ctaHref: str(spec.ctaHref),
      imageSide: str(spec.imageSide) === "right" ? "right" : "left",
    };
  }

  if (kind === "editorialPair") {
    // Reuses the shared `items` repeater: image + title as the caption + text
    // as the link label. Two is the shape, but three renders as a row of three
    // and one as a single wide block, so an editor is not boxed in.
    const items = Array.isArray(spec.items)
      ? (spec.items as Array<Record<string, unknown>>)
          .map((it) => ({
            image: str(it.image) ?? "",
            caption: str(it.title) ?? "",
            linkLabel: str(it.text),
            href: str(it.href),
          }))
          .filter((it) => it.image)
      : [];
    if (items.length === 0) return null;
    return { kind, key, title: str(spec.title), eyebrow, subtitle, items };
  }

  if (kind === "worldTiles") {
    // The same shared `items` repeater editorialPair reads, mapped differently:
    // Title becomes the word laid over the picture rather than a caption under
    // it, and there is no link label because the whole tile is the link.
    //
    // Filtered on the image alone, like editorialPair — a row with no artwork
    // has nothing to lay a name over, whereas a row with no link is merely a
    // doorway that does not open yet, which the renderer handles.
    const items = Array.isArray(spec.items)
      ? (spec.items as Array<Record<string, unknown>>)
          .map((it) => ({
            image: str(it.image) ?? "",
            label: str(it.title) ?? "",
            href: str(it.href),
          }))
          .filter((it) => it.image)
      : [];
    if (items.length === 0) return null;
    return {
      kind,
      key,
      title: str(spec.title),
      eyebrow,
      subtitle,
      items,
      // Anything the editor has not set falls back to the full-width row, which
      // is the arrangement this section shipped as.
      layout: str(spec.layout) === "stagger" ? "stagger" : "row",
    };
  }

  if (kind === "story") {
    // The image is the section — pinned full-bleed with copy over it — so
    // without one there is nothing to pin and this renders nothing rather than
    // a viewport of empty background.
    const title = str(spec.title);
    const image = str(spec.image);
    if (!title || !image) return null;

    // Reuses the `items` array field that `usp` already defines, so the CMS
    // form needs no new repeater — each row's `text` is one stage of copy.
    const stages = Array.isArray(spec.items)
      ? (spec.items as Array<Record<string, unknown>>)
          .map((it) => str(it.text))
          .filter((text): text is string => !!text)
      : [];

    return {
      kind,
      key,
      title,
      eyebrow,
      stages,
      image,
      ctaLabel: str(spec.ctaLabel),
      ctaHref: str(spec.ctaHref),
      pinnedReveal: spec.pinnedReveal === true,
    };
  }

  // One selection for both category kinds — they differ only in how they are
  // drawn, so splitting the query would be two ways to answer "which categories
  // does the homepage show" and an invitation for them to drift apart.
  if (kind === "categoryTiles" || kind === "categoryPills") {
    const categories = await getActiveCategories();
    const items = categories
      .filter((c) => c.image)
      .slice(0, clampLimit(spec.limit, 6))
      .map((c) => ({ id: c.id, name: c.name, slug: c.slug, image: c.image }));
    // Every tile needs artwork, so a catalogue with no category images renders
    // nothing rather than a row of empty circles.
    if (items.length === 0) return null;

    // No pinnedReveal: this is a padded container-page row and cannot own a
    // viewport. The CMS does not offer the field here — see the kind's note.
    if (kind === "categoryPills") {
      return { kind, key, title: str(spec.title), eyebrow, subtitle, items };
    }

    return {
      kind,
      key,
      title: str(spec.title) ?? "",
      eyebrow,
      subtitle,
      items,
      pinnedReveal: spec.pinnedReveal === true,
    };
  }

  if (kind === "usp") {
    const items = Array.isArray(spec.items)
      ? (spec.items as Array<Record<string, unknown>>)
          .map((it) => ({ icon: str(it.icon), title: str(it.title), text: str(it.text) }))
          .filter((it) => it.title || it.text)
      : [];
    if (items.length === 0) return null;
    return { kind, key, title: str(spec.title) ?? "", eyebrow, subtitle, items };
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
      pinnedReveal: spec.pinnedReveal === true,
    };
  }

  if (kind === "collectionSpotlight") {
    const chosen = selectCollections(ctx.collections, {
      featuredOnly: spec.featuredOnly === true,
      take: clampLimit(spec.limit, 8),
    });

    /**
     * Three pieces per card, from the collection's own tag.
     *
     * ⚠️  Most collections in this database have no productTag published yet —
     * the tag fixes exist only in each entry's draft. Rather than render a
     * banner with an empty shelf under it, a collection with no tag falls back
     * to the newest pieces in the catalogue. That is a stand-in, not a claim
     * about membership: the moment an editor publishes a collection with its
     * tag set, that card shows its own products with no code change.
     *
     * Fetched in parallel — eight sequential tag queries would be eight round
     * trips before this section could stream.
     */
    const items = await Promise.all(
      chosen.map(async (collection) => {
        const banner = collection.heroImage ?? collection.thumbnailImage;
        const products = collection.productTag
          ? await getProductsByTag(collection.productTag, 3)
          : await getSectionProducts("newest", undefined, 3);
        return {
          id: collection.id,
          slug: collection.slug,
          title: collection.title,
          banner: banner ?? "",
          products: products
            .filter((p) => p.images[0])
            .map((p) => ({ id: p.id, slug: p.slug, name: p.name, image: p.images[0] })),
        };
      })
    );

    // A card is its artwork; without one there is nothing to show.
    const withArt = items.filter((it) => it.banner);
    if (withArt.length === 0) return null;

    return {
      kind,
      key,
      title: str(spec.title) ?? "",
      eyebrow,
      subtitle,
      viewAllHref,
      items: withArt,
    };
  }

  if (kind === "collections") {
    const items = selectCollections(ctx.collections, {
      featuredOnly: spec.featuredOnly === true,
      take: clampLimit(spec.limit, 3),
    });
    if (items.length === 0) return null;
    return { kind, key, title: str(spec.title) ?? "", eyebrow, subtitle, viewAllHref, items };
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
    subtitle,
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

  // The shared mapper, so this cannot drift from ProductListItem again.
  return products.map(toProductListItem);
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
  // Both collection kinds read the same entry list — see the note on
  // collectionSpotlight for how the two differ.
  const wantsCollections = specs.some(
    (s) => str(s.type) === "collections" || str(s.type) === "collectionSpotlight"
  );

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
