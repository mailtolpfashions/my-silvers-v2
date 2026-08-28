import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/server/db";
import { listPublishedEntries } from "@/server/cms/entries";

const BASE = "https://www.mysilvers.in";

/**
 * /llms.txt — the shop, described for an AI assistant rather than a crawler.
 *
 * ── Why this exists alongside the sitemap ────────────────────────────────────
 * A sitemap answers "what URLs are there". It says nothing about what the shop
 * IS, and an assistant asked for hallmarked silver in India has to infer that
 * from whatever pages it happened to fetch. This is the emerging convention for
 * saying it directly: one plain-text markdown document, small enough to be read
 * whole, that names the shop and points at the handful of pages worth reading.
 *
 * Being cited by an assistant is a real acquisition channel for a shop this
 * size, and it is one the sitemap cannot serve. `app/robots.ts` names the same
 * assistants' crawlers explicitly so they are allowed to read this.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 * Same as the structured data: every line below the description comes from a
 * published record. Nothing about pricing, delivery, returns or hallmarking is
 * written here — those are business claims, they live in the CMS, and a second
 * copy in this file is a second copy to contradict. The description is the one
 * piece of prose, and it says only what the shop's own metadata already says.
 *
 * Individual products are deliberately absent. 120 product lines would crowd
 * out the structure, and a product page carries far better data as Product
 * JSON-LD than it would as a bare link here. Categories are the useful level.
 */

/** Escapes the `]` that would otherwise break out of a markdown link label. */
function label(text: string) {
  return text.replace(/[[\]]/g, "");
}

function section(heading: string, lines: string[]) {
  if (lines.length === 0) return "";
  return `## ${heading}\n\n${lines.join("\n")}\n\n`;
}

async function buildLlmsTxt() {
  "use cache";
  cacheLife("hours");
  // The same tags the sitemap carries, so publishing a category, a collection
  // or a post refreshes both together rather than leaving this one stale.
  cacheTag("products", "categories", "cms:blog", "cms:page", "cms:collection", "cms:faq");

  const [categories, collections, posts, pages] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      select: { name: true, slug: true, description: true },
      orderBy: { name: "asc" },
    }),
    listPublishedEntries("collection", 50),
    listPublishedEntries("blog", 25),
    listPublishedEntries("page", 50),
  ]);

  /** CMS entries keep their display title in `data.title`; slug is the fallback. */
  const titleOf = (entry: { slug: string; data: unknown }) => {
    const d = entry.data as { title?: string } | null;
    return d?.title?.trim() || entry.slug;
  };

  const head =
    `# MY Silvers\n\n` +
    `> An Indian online jewellery shop selling 925 BIS hallmarked sterling ` +
    `silver — rings, earrings, necklaces, bracelets and anklets. Prices are in ` +
    `Indian rupees and orders ship within India.\n\n`;

  return (
    head +
    section(
      "Categories",
      categories.map((c) => {
        const note = c.description?.trim();
        return `- [${label(c.name)}](${BASE}/category/${c.slug})${note ? `: ${note}` : ""}`;
      })
    ) +
    section(
      "Collections",
      collections.map((c) => `- [${label(titleOf(c))}](${BASE}/collections/${c.slug})`)
    ) +
    section(
      "Journal",
      posts.map((p) => `- [${label(titleOf(p))}](${BASE}/blog/${p.slug})`)
    ) +
    section("Help", [
      `- [Frequently asked questions](${BASE}/faq): delivery, returns, sizing, hallmarking and care, answered by the shop.`,
      `- [Full catalogue](${BASE}/products)`,
      ...pages.map((p) => `- [${label(titleOf(p))}](${BASE}/p/${p.slug})`),
    ])
  );
}

export async function GET() {
  const body = await buildLlmsTxt();

  return new Response(body, {
    headers: {
      // text/plain, not text/markdown: the convention is that this is readable
      // in a browser tab, and a markdown content type prompts a download in
      // some of them.
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
