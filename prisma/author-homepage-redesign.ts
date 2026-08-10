/**
 * Re-authors the homepage and repairs the collection entries for the premium
 * redesign.
 *
 *   npx tsx prisma/author-homepage-redesign.ts          # write drafts
 *   npx tsx prisma/author-homepage-redesign.ts --verify # resolve, don't write
 *
 * ── Why this writes DRAFTS and never publishes ───────────────────────────────
 * Publishing is a server action that also calls revalidateTag() — writing
 * publishedData straight from a script would update the database while leaving
 * Next's cache serving the old homepage, with no obvious way to tell that had
 * happened. So this fills the working draft only. An editor then opens
 * /cms/content/homepage, sees the new arrangement in the live preview pane, and
 * clicks Publish, which is the path that invalidates the cache correctly.
 *
 * ── What it does NOT do ──────────────────────────────────────────────────────
 * It writes no copy that makes a claim about the business. Every trust claim in
 * the USP section is lifted verbatim from the trustItems the shop had already
 * authored; nothing is added, softened or invented. Imagery is reused from what
 * is already in the CMS — see the placeholder audit printed at the end.
 *
 * Idempotent: running it twice produces the same draft.
 */
import { config } from "dotenv";
config();

import { writeFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const VERIFY_ONLY = process.argv.includes("--verify");

type Json = Record<string, unknown>;

/** Collections whose productTag was never set, so their pages showed nothing. */
const COLLECTION_TAG_FIXES: Record<string, string> = {
  // Each of these tags genuinely exists on products in the catalogue — checked
  // against a tag census before this list was written. `everyday` had its tag
  // set to "pendants", which is a category, not this collection.
  bridal: "bridal",
  everyday: "everyday",
  office: "office",
  oxidised: "oxidised",
};

async function main() {
  const homepage = await prisma.contentEntry.findFirst({
    where: { contentType: { name: "homepage" } },
  });
  if (!homepage) throw new Error("No homepage entry found. Run `npm run db:seed` first.");

  const published = (homepage.publishedData ?? homepage.data ?? {}) as Json;

  // ── Back up before touching anything ──────────────────────────────────────
  const backupPath = `prisma/backup-homepage-${Date.now()}.json`;
  if (!VERIFY_ONLY) {
    writeFileSync(
      backupPath,
      JSON.stringify({ data: homepage.data, publishedData: homepage.publishedData }, null, 2)
    );
  }

  const slides = Array.isArray(published.slides)
    ? (published.slides as Json[])
    : [];

  /**
   * One hero, not three.
   *
   * An auto-advancing three-slide carousel is a compromise between three
   * campaigns, and it reads as one — the shopper sees whichever slide happens
   * to be showing and no message lands. The other two slides are KEPT, with
   * isActive false, so their copy survives and either can be switched back on
   * from the CMS the moment it has real photography behind it.
   *
   * The one left active is the only slide with a real (non-placeholder) image.
   */
  // Typed as Json[] rather than inferred: the fallback assignment below
  // otherwise narrows the element type to `{ isActive: boolean }` and every
  // later read of `slide.media` fails to compile.
  const nextSlides: Json[] = slides.map((slide) => {
    const media = typeof slide.media === "string" ? slide.media : "";
    const isReal = media.includes("res.cloudinary.com");
    return { ...slide, isActive: isReal };
  });
  // If nothing had real artwork, keep the first slide rather than shipping a
  // homepage with no hero at all.
  if (!nextSlides.some((s) => s.isActive) && nextSlides.length > 0) {
    nextSlides[0] = { ...nextSlides[0], isActive: true };
  }

  const oldSections = Array.isArray(published.sections) ? (published.sections as Json[]) : [];
  const find = (type: string) => oldSections.find((s) => s.type === type) ?? {};

  const oldPair = find("editorialPair") as Json;
  const oldStory = find("story") as Json;

  /**
   * Trust claims, lifted verbatim from the shop's own trustItems.
   *
   * These are business claims — a returns window, a shipping threshold, a
   * hallmark — and this script has no standing to write, reword or improve
   * them. They move from the trust bar under the hero (where they were four
   * icons competing with the first product) to a quiet block above the footer.
   */
  const trustItems = Array.isArray(published.trustItems)
    ? (published.trustItems as Json[])
    : [];

  const sections: Json[] = [
    // 04 — Category doorways, IMMEDIATELY after the hero.
    //
    // Three square tiles in one gapless band. Placed first on purpose: the hero
    // says what the brand is, and the very next thing a shopper should meet is
    // a way in. Putting an editorial pair here instead made them scroll past a
    // second piece of storytelling before the site offered a route to product.
    // The component reads Category.image directly and renders nothing at all if
    // none of them have artwork.
    { type: "categoryTiles", limit: 3, isActive: true },

    // 05 — Two ways in. The editorial beat, now AFTER the doorways.
    {
      type: "editorialPair",
      title: oldPair.title ?? "Two ways in",
      eyebrow: oldPair.eyebrow ?? "Where to start",
      subtitle: oldPair.subtitle,
      isActive: true,
      items: [
        {
          image: (oldPair.items as Json[])?.[0]?.image ?? "",
          title: "Everyday Silver",
          text: "Explore everyday",
          href: "/collections/everyday",
        },
        {
          image: (oldPair.items as Json[])?.[1]?.image ?? "",
          title: "The Bridal Edit",
          text: "Explore bridal",
          href: "/collections/bridal",
        },
      ],
    },

    // 06 — New in. First commerce section.
    {
      type: "products",
      source: "newest",
      limit: 8,
      title: "New in",
      eyebrow: "Just arrived",
      viewAllHref: "/products?sort=newest",
      isActive: true,
    },

    // 07 — 925, in our words. The pinned story block.
    {
      type: "story",
      title: oldStory.title ?? "The making of a piece",
      eyebrow: oldStory.eyebrow ?? "The craft",
      image: oldStory.image,
      items: oldStory.items ?? [],
      ctaLabel: oldStory.ctaLabel,
      ctaHref: oldStory.ctaHref,
      isActive: true,
    },

    // 08 — Featured collection.
    {
      type: "collections",
      featuredOnly: true,
      limit: 3,
      title: "The collections",
      eyebrow: "Curated",
      subtitle: "Each one built around a single idea.",
      viewAllHref: "/collections",
      isActive: true,
    },

    // 09 — Bestsellers. Second and LAST product grid on the page.
    {
      type: "products",
      source: "bestseller",
      limit: 8,
      title: "Bestsellers",
      eyebrow: "Most loved",
      viewAllHref: "/products?sort=featured",
      isActive: true,
    },

    // 10 — From the journal. Two editorial tiles.
    {
      type: "editorialPair",
      title: "From the journal",
      eyebrow: "Notes on silver",
      isActive: true,
      items: [] as Json[], // filled below from real published posts
    },

    // 11 — The craft. Trust claims, quietly, above the footer.
    {
      type: "usp",
      title: "Why 925",
      eyebrow: "The craft",
      items: trustItems,
      isActive: true,
    },
  ];

  // ── Journal tiles, from genuinely published posts ─────────────────────────
  const posts = await prisma.contentEntry.findMany({
    where: { contentType: { name: "blog" }, status: "published" },
    orderBy: { publishedAt: "desc" },
    take: 2,
    select: { slug: true, publishedData: true },
  });

  const journalSection = sections.find(
    (s) => s.type === "editorialPair" && s.title === "From the journal"
  )!;
  journalSection.items = posts.map((post) => {
    const d = (post.publishedData ?? {}) as Json;
    return {
      image: d.coverImage ?? "",
      title: d.title ?? post.slug,
      text: "Read more",
      href: `/blog/${post.slug}`,
    };
  });
  // No posts, or none with artwork — drop the section rather than ship a
  // heading over an empty row.
  if ((journalSection.items as Json[]).every((i) => !i.image)) {
    journalSection.isActive = false;
  }

  // The USP block now carries these claims; leaving trustItems populated would
  // print the same four facts twice on one page.
  const nextData: Json = {
    ...published,
    slides: nextSlides,
    trustItems: [],
    sections,
  };

  // ── Report ────────────────────────────────────────────────────────────────
  console.log("HOMEPAGE DRAFT");
  console.log(`  hero slides active: ${nextSlides.filter((s) => s.isActive).length}/${nextSlides.length}`);
  sections.forEach((s, i) => {
    console.log(`  ${String(i + 1).padStart(2, "0")} ${String(s.type).padEnd(16)} ${s.isActive === false ? "(inactive)" : ""} ${s.title ?? ""}`);
  });

  const placeholders: string[] = [];
  const scan = (label: string, url: unknown) => {
    if (typeof url === "string" && url.includes("placehold.co")) placeholders.push(label);
  };
  nextSlides.forEach((s, i) => s.isActive && scan(`hero slide ${i + 1}`, s.media));
  scan("story image", oldStory.image);
  // Found by identity, not by index — this read `sections[0]` and broke the
  // moment the running order changed.
  const pairSection = sections.find(
    (s) => s.type === "editorialPair" && s !== journalSection
  );
  ((pairSection?.items as Json[]) ?? []).forEach((it, i) =>
    scan(`two-ways-in tile ${i + 1}`, it.image)
  );
  ((journalSection.items as Json[]) ?? []).forEach((it, i) =>
    scan(`journal tile ${i + 1}`, it.image)
  );

  const categories = await prisma.category.findMany({ where: { isActive: true } });
  categories.forEach((c) => scan(`category image: ${c.slug}`, c.image));
  const collections = await prisma.contentEntry.findMany({
    where: { contentType: { name: "collection" }, status: "published" },
    select: { slug: true, publishedData: true },
  });
  collections.forEach((c) => scan(`collection thumb: ${c.slug}`, (c.publishedData as Json)?.thumbnailImage));

  if (VERIFY_ONLY) {
    console.log("\n--verify: nothing written.");
    return;
  }

  // ── Write ─────────────────────────────────────────────────────────────────
  await prisma.contentEntry.update({
    where: { id: homepage.id },
    // `data` only. publishedData is untouched, so the live site is unchanged
    // until an editor clicks Publish in /cms.
    data: { data: nextData as never },
  });
  console.log(`\nHomepage DRAFT written. Backup: ${backupPath}`);

  // ── Collection tag repairs ────────────────────────────────────────────────
  console.log("\nCOLLECTION productTag REPAIRS (draft only)");
  for (const [slug, tag] of Object.entries(COLLECTION_TAG_FIXES)) {
    const entry = await prisma.contentEntry.findFirst({
      where: { contentType: { name: "collection" }, slug },
    });
    if (!entry) {
      console.log(`  ${slug.padEnd(10)} — no entry, skipped`);
      continue;
    }
    const current = (entry.data ?? {}) as Json;
    const before = current.productTag;
    if (before === tag) {
      console.log(`  ${slug.padEnd(10)} already "${tag}"`);
      continue;
    }
    await prisma.contentEntry.update({
      where: { id: entry.id },
      data: { data: { ...current, productTag: tag } as never },
    });
    const count = await prisma.product.count({
      where: { isActive: true, stock: { gt: 0 }, tags: { has: tag } },
    });
    console.log(`  ${slug.padEnd(10)} ${String(before ?? "unset")} -> "${tag}" (${count} products)`);
  }

  console.log("\nPLACEHOLDER IMAGERY STILL IN USE — these need real photography:");
  if (placeholders.length === 0) console.log("  (none)");
  else [...new Set(placeholders)].forEach((p) => console.log(`  - ${p}`));

  console.log("\nNEXT STEP: open /cms/content/homepage, review the preview pane, click Publish.");
  console.log("Then publish each collection listed above so its product tag goes live.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("FAILED:", error.message);
    process.exit(1);
  });
