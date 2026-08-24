/**
 * The FAQ's shape and grouping, with no runtime dependencies.
 *
 * Deliberately free of `next/*` and Prisma imports so `prisma/seed.ts` — a
 * plain tsx script running outside Next — can import the group list. The seed
 * defines the content type's `select` options from it, and the storefront
 * orders its sections by it, so the two cannot fall out of step.
 */

/**
 * The groups a question can belong to, in the order they appear on /faq.
 *
 * Ordered by when a shopper asks: what am I buying, how do I pay, when does it
 * arrive, what if it is wrong, how do I look after it. Adding a group here adds
 * it to the CMS dropdown and to the page; removing one leaves any question
 * already assigned to it in "Other", never hidden — see groupFaqItems.
 */
export const FAQ_GROUPS = [
  "Ordering & payment",
  "Shipping & delivery",
  "Returns & exchanges",
  "Product & sizing",
  "Care & maintenance",
] as const;

export type FaqGroup = (typeof FAQ_GROUPS)[number];

export type FaqItem = {
  question: string;
  /** Sanitized rich-text HTML — render through <RichText>, never raw. */
  answer: string;
  group: string;
  /** Whether this question also appears in the product page's FAQ row. */
  showOnProductPage: boolean;
};

/** Questions with no group, or a group no longer in FAQ_GROUPS, collect here. */
export const FAQ_OTHER_GROUP = "Other";

/**
 * Coerces the CMS `items` array into FaqItems.
 *
 * Field-by-field rather than a cast: `data` is a JSON column, so nothing about
 * its shape is guaranteed by the database. A half-written item — a question
 * with no answer yet, which is the normal state while an FAQ is being authored
 * — is DROPPED rather than rendered as an empty accordion row.
 */
export function parseFaqItems(raw: unknown): FaqItem[] {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((entry): FaqItem[] => {
    if (typeof entry !== "object" || entry === null) return [];
    const item = entry as Record<string, unknown>;

    const question = typeof item.question === "string" ? item.question.trim() : "";
    const answer = typeof item.answer === "string" ? item.answer.trim() : "";
    // Both halves or nothing. A question with no answer is worse than absent:
    // it advertises that we know the concern and have not addressed it.
    if (!question || !answer) return [];

    const group = typeof item.category === "string" ? item.category.trim() : "";

    return [
      {
        question,
        answer,
        group: group || FAQ_OTHER_GROUP,
        showOnProductPage: item.showOnProductPage === true,
      },
    ];
  });
}

/**
 * Groups items for display, in FAQ_GROUPS order.
 *
 * Empty groups are omitted, so a shop that has only written shipping questions
 * shows one section rather than five headings over nothing. Anything in an
 * unrecognised group falls into "Other" at the end — a renamed group must never
 * make a published answer disappear from the page.
 */
export function groupFaqItems(items: FaqItem[]): Array<{ group: string; items: FaqItem[] }> {
  const known = FAQ_GROUPS.map((group) => ({
    group: group as string,
    items: items.filter((item) => item.group === group),
  }));

  const other = items.filter(
    (item) => !(FAQ_GROUPS as readonly string[]).includes(item.group)
  );
  if (other.length > 0) known.push({ group: FAQ_OTHER_GROUP, items: other });

  return known.filter((section) => section.items.length > 0);
}
