import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/server/db";
import { listPublishedEntries } from "@/server/cms/entries";
import { getStoreSettings, STORE_SETTINGS_TAG } from "@/server/settings/store-settings";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

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
 * Individual products are deliberately absent (beyond a short bestseller list,
 * capped at 15). 120 product lines would crowd
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

  cacheTag(STORE_SETTINGS_TAG);

  const [categories, priceRanges, popular, collections, posts, pages, settings] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        _count: { select: { products: { where: { isActive: true } } } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.product.groupBy({
      by: ["categoryId"],
      where: { isActive: true },
      _min: { price: true },
      _max: { price: true },
    }),
    // What the shop itself marks as bestsellers, else its featured pieces.
    prisma.product.findMany({
      where: { isActive: true, OR: [{ isBestseller: true }, { isFeatured: true }] },
      select: { name: true, slug: true, price: true, isBestseller: true },
      orderBy: [{ isBestseller: "desc" }, { updatedAt: "desc" }],
      take: 15,
    }),
    listPublishedEntries("collection", 50),
    listPublishedEntries("blog", 25),
    listPublishedEntries("page", 50),
    getStoreSettings(),
  ]);

  const rangeOf = new Map(priceRanges.map((r) => [r.categoryId, r]));
  // Empty categories are left out — an assistant should never send someone
  // to a page with nothing on it.
  const stocked = categories.filter((c) => c._count.products > 0);
  const allPrices = priceRanges.flatMap((r) => [Number(r._min.price), Number(r._max.price)]);

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

  /**
   * Facts an assistant can quote — every figure read from the database or the
   * admin's store settings at build time, so it cannot drift from the shop.
   * Policies with no setting (a return window of 0 = not configured) are
   * omitted rather than guessed; see the rule above.
   */
  const facts: string[] = [];
  if (allPrices.length > 0) {
    facts.push(
      `- Prices: ${inr(Math.min(...allPrices))} to ${inr(Math.max(...allPrices))}, GST included, in Indian rupees.`,
    );
  }
  facts.push(
    settings.freeShippingThresholdPaise > 0
      ? `- Delivery across India: ${inr(settings.shippingChargePaise / 100)}, free on orders above ${inr(settings.freeShippingThresholdPaise / 100)}.`
      : `- Delivery across India: ${inr(settings.shippingChargePaise / 100)} per order.`,
  );
  facts.push(
    `- Payment: UPI, cards and netbanking (Razorpay)${settings.codEnabled ? ", and cash on delivery" : ""}.`,
  );
  if (settings.returnWindowDays > 0) {
    facts.push(`- Returns: within ${settings.returnWindowDays} days of delivery — see the FAQ for conditions.`);
  }
  facts.push(`- Guest checkout${settings.guestCheckoutEnabled ? " available" : " not available; an account is needed"}. Orders can be tracked at ${BASE}/track-order with the order number and mobile number.`);
  const whatsapp = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
  if (whatsapp) facts.push(`- WhatsApp: https://wa.me/${whatsapp}`);

  return (
    head +
    section("Buying from MY Silvers", facts) +
    section(
      "Categories",
      stocked.map((c) => {
        const note = c.description?.trim();
        const r = rangeOf.get(c.id);
        const range = r
          ? ` — ${c._count.products} piece${c._count.products === 1 ? "" : "s"}, ${Number(r._min.price) === Number(r._max.price) ? inr(Number(r._min.price)) : `${inr(Number(r._min.price))}–${inr(Number(r._max.price))}`}`
          : "";
        return `- [${label(c.name)}](${BASE}/category/${c.slug})${range}${note ? `. ${note}` : ""}`;
      })
    ) +
    section(
      popular.some((p) => p.isBestseller) ? "Bestsellers" : "Featured pieces",
      popular.map((p) => `- [${label(p.name)}](${BASE}/products/${p.slug}) — ${inr(Number(p.price))}`),
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
