import { getPublishedEntry } from "@/server/cms/entries";
import { parseFaqItems, type FaqItem } from "@/lib/faq";

/**
 * The published FAQ.
 *
 * Reads the `faq` singleton through getPublishedEntry, so it inherits that
 * function's cache and its invalidation — publishing in the CMS clears the
 * `cms:faq` tag and the new answers are live on the next request.
 *
 * ⚠️  Returns only PUBLISHED content. A draft answer must never reach the
 * storefront: a half-written returns policy is a promise the shop has not
 * agreed to yet.
 */
export async function getFaqItems(): Promise<FaqItem[]> {
  const entry = await getPublishedEntry("faq");
  if (!entry) return [];

  const data = entry.data as { items?: unknown };
  return parseFaqItems(data.items);
}

/**
 * The intro line shown under the heading on /faq, if one is written.
 *
 * Separate from getFaqItems because the product page has no use for it — that
 * row is a list of answers, not a page with a lede.
 */
export async function getFaqIntro(): Promise<string | null> {
  const entry = await getPublishedEntry("faq");
  if (!entry) return null;

  const data = entry.data as { intro?: unknown };
  const intro = typeof data.intro === "string" ? data.intro.trim() : "";
  return intro || null;
}
