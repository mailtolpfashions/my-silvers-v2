import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/server/db";
import { getActiveCategories } from "@/server/products/search";

/** One suggestion chip: a label to show and where it goes. */
export type SearchTerm = { label: string; href: string };

/**
 * The terms shown under an idle search box, and the phrases its placeholder
 * cycles through.
 *
 * Derived from the catalogue rather than typed anywhere. The previous storefront
 * kept an equivalent list as a hardcoded `POPULAR_SEARCHES` const that happened
 * to mirror the categories — so it silently went stale the moment the catalogue
 * changed. Reading the categories directly removes that whole class of drift:
 * add a category in /admin/categories and it appears here on the next
 * revalidation, with nothing to remember.
 *
 * Bestsellers are appended after the categories because a shopper scanning
 * chips wants the broad routes first and a specific piece second.
 */
export async function getSearchTerms(): Promise<{
  /** Chips for the idle dropdown. */
  popular: SearchTerm[];
  /** Phrases for the rotating placeholder. */
  placeholders: string[];
}> {
  "use cache";
  cacheLife("hours");
  cacheTag("categories");
  cacheTag("products");

  const [categories, bestsellers] = await Promise.all([
    getActiveCategories(),
    prisma.product.findMany({
      where: { isActive: true, isBestseller: true, stock: { gt: 0 } },
      select: { name: true, slug: true },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
  ]);

  const popular: SearchTerm[] = [
    ...categories.map((category) => ({
      label: category.name,
      href: `/category/${category.slug}`,
    })),
    ...bestsellers.map((product) => ({
      label: product.name,
      href: `/products/${product.slug}`,
    })),
  ];

  // Lowercased so "Search for rings" reads as a phrase rather than a proper
  // noun. Categories only — a full product name makes the placeholder too long
  // to scan in a field a shopper is about to type into.
  const placeholders = categories.map(
    (category) => `Search for ${category.name.toLowerCase()}`,
  );

  return { popular, placeholders };
}
