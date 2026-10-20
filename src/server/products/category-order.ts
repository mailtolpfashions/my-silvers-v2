import type { Prisma } from "@/generated/prisma/client";

/**
 * The one order categories are listed in — header, footer, search
 * suggestions and every admin picker.
 *
 * ⚠️  Name is the tie-break, and it is not optional. Ordering by sortOrder
 * alone leaves equal values in whatever order Postgres happens to return them,
 * which is not stable: a shop that leaves every category at the default 0
 * would see its header menu reshuffle between page loads. With the name
 * second, equal sortOrders read alphabetically, every time.
 */
export const CATEGORY_ORDER: Prisma.CategoryOrderByWithRelationInput[] = [
  { sortOrder: "asc" },
  { name: "asc" },
];
