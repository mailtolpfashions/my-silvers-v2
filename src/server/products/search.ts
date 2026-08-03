import { prisma } from "@/server/db";

export type ProductListItem = {
  id: string;
  name: string;
  slug: string;
  price: string;
  compareAtPrice: string | null;
  images: string[];
  isBestseller: boolean;
  isFeatured: boolean;
  /** Raw count — never render it directly, use src/lib/stock-label.ts. */
  stock: number;
  categoryName: string;
};

export async function searchProducts(params: {
  q?: string;
  categorySlug?: string;
  sort?: "newest" | "price-asc" | "price-desc" | "featured";
  /** Rupees, inclusive. Ignored when not a finite non-negative number. */
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  pageSize?: number;
}): Promise<{ items: ProductListItem[]; total: number }> {
  // Clamp to sane integers — `page` often comes straight from a URL query
  // param, so NaN/negative/huge values must not reach LIMIT/OFFSET.
  const page = Math.max(1, Math.trunc(Number(params.page) || 1));
  const pageSize = Math.min(60, Math.max(1, Math.trunc(Number(params.pageSize) || 24)));
  const offset = (page - 1) * pageSize;

  const orderBy =
    params.sort === "price-asc"
      ? `p."price" ASC`
      : params.sort === "price-desc"
        ? `p."price" DESC`
        : params.sort === "featured"
          ? `p."isFeatured" DESC, p."createdAt" DESC`
          : `p."createdAt" DESC`;

  // Raw SQL is required here: full-text search against the generated
  // `searchVector` tsvector column (not represented in schema.prisma — see
  // prisma/migrations for the column/index) is not expressible via the
  // Prisma query builder.
  // Sold-out pieces are hidden from every storefront listing. They stay
  // reachable at their own URL, so existing links, wishlists and search engine
  // results don't break — the product page shows "Out of stock" instead.
  const whereClauses: string[] = [`p."isActive" = true`, `p."stock" > 0`];
  const values: unknown[] = [];

  if (params.q && params.q.trim().length > 0) {
    values.push(params.q.trim());
    whereClauses.push(`p."searchVector" @@ websearch_to_tsquery('english', $${values.length})`);
  }

  if (params.categorySlug) {
    values.push(params.categorySlug);
    whereClauses.push(`c."slug" = $${values.length}`);
  }

  // Price bounds arrive from the URL, so anything non-numeric or negative is
  // dropped rather than reaching the query.
  const minPrice = Number(params.minPrice);
  if (Number.isFinite(minPrice) && minPrice > 0) {
    values.push(minPrice);
    whereClauses.push(`p."price" >= $${values.length}`);
  }

  const maxPrice = Number(params.maxPrice);
  if (Number.isFinite(maxPrice) && maxPrice > 0) {
    values.push(maxPrice);
    whereClauses.push(`p."price" <= $${values.length}`);
  }

  const whereSql = whereClauses.join(" AND ");

  values.push(pageSize, offset);
  const limitParam = values.length - 1;
  const offsetParam = values.length;

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      name: string;
      slug: string;
      price: string;
      compareAtPrice: string | null;
      images: string[];
      isBestseller: boolean;
      isFeatured: boolean;
      stock: number;
      categoryName: string;
    }>
  >(
    `SELECT p."id", p."name", p."slug", p."price"::text, p."compareAtPrice"::text as "compareAtPrice",
            p."images", p."isBestseller", p."isFeatured", p."stock", c."name" as "categoryName"
     FROM "Product" p
     JOIN "Category" c ON c."id" = p."categoryId"
     WHERE ${whereSql}
     ORDER BY ${orderBy}
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    ...values
  );

  const countRows = await prisma.$queryRawUnsafe<Array<{ count: string }>>(
    `SELECT COUNT(*)::text as count
     FROM "Product" p
     JOIN "Category" c ON c."id" = p."categoryId"
     WHERE ${whereSql}`,
    ...values.slice(0, values.length - 2)
  );

  return { items: rows, total: Number(countRows[0]?.count ?? 0) };
}

export async function getProductBySlug(slug: string) {
  return prisma.product.findFirst({
    where: { slug, isActive: true },
    include: { category: true },
  });
}

export async function getActiveCategories() {
  return prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}
