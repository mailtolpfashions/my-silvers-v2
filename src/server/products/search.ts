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
  categoryName: string;
};

export async function searchProducts(params: {
  q?: string;
  categorySlug?: string;
  sort?: "newest" | "price-asc" | "price-desc" | "featured";
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
  const whereClauses: string[] = [`p."isActive" = true`];
  const values: unknown[] = [];

  if (params.q && params.q.trim().length > 0) {
    values.push(params.q.trim());
    whereClauses.push(`p."searchVector" @@ websearch_to_tsquery('english', $${values.length})`);
  }

  if (params.categorySlug) {
    values.push(params.categorySlug);
    whereClauses.push(`c."slug" = $${values.length}`);
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
      categoryName: string;
    }>
  >(
    `SELECT p."id", p."name", p."slug", p."price"::text, p."compareAtPrice"::text as "compareAtPrice",
            p."images", p."isBestseller", p."isFeatured", c."name" as "categoryName"
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
