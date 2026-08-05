import { prisma } from "@/server/db";
import { assertAllowedMediaUrls } from "@/server/media/url-allowlist";

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function uniqueProductSlug(name: string): Promise<string> {
  const base = slugify(name) || "product";
  let slug = base;
  for (let n = 2; ; n++) {
    const existing = await prisma.product.findUnique({ where: { slug } });
    if (!existing) return slug;
    slug = `${base}-${n}`;
  }
}

export type ProductInput = {
  name: string;
  description?: string;
  shortDescription?: string;
  price: number;
  compareAtPrice?: number | null;
  images: string[];
  videoUrl?: string | null;
  categoryId: string;
  weight?: number | null;
  purity?: string;
  dimensions?: string;
  /**
   * Sizes and their stock, in display order. Empty for an unsized piece, which
   * then uses `stock` directly.
   *
   * Replaces the old `sizes: string[]` + single `stock`: those could not
   * express "4 in size 6, none in size 7", so the shop could sell a size it did
   * not have.
   */
  sizeStock: Array<{ size: string; stock: number }>;
  material?: string;
  /** Used only when sizeStock is empty; otherwise derived as the sum. */
  stock: number;
  sku: string;
  isFeatured: boolean;
  isBestseller: boolean;
  isActive?: boolean;
  tags: string[];
};

/**
 * Distributes one stock figure across sizes, remainder to the earliest.
 * 22 over 4 sizes -> 6, 6, 5, 5. The parts always sum to the original.
 */
export function splitStockEvenly(
  sizes: string[],
  stock: number,
): Array<{ size: string; stock: number }> {
  if (sizes.length === 0) return [];
  const base = Math.floor(stock / sizes.length);
  const remainder = stock % sizes.length;
  return sizes.map((size, i) => ({ size, stock: base + (i < remainder ? 1 : 0) }));
}

function validateMedia(input: Pick<ProductInput, "images" | "videoUrl">) {
  if (input.images.length > 6) throw new Error("A product may have at most 6 images.");
  assertAllowedMediaUrls(input.images, "Image");
  if (input.videoUrl) assertAllowedMediaUrls([input.videoUrl], "Video");
}

/**
 * Splits the admin payload into the Product columns and the variant rows.
 *
 * Product.sizes and Product.stock are DERIVED for a sized piece: the labels come
 * from the rows in order, and the total is their sum. Keeping them in step here
 * is what lets every listing, the search query and the scarcity labels keep
 * filtering on Product.stock — see the note on that field in schema.prisma.
 */
function splitVariants(input: ProductInput) {
  const rows = input.sizeStock
    .map((r) => ({ size: r.size.trim(), stock: Math.max(0, Math.trunc(r.stock)) }))
    .filter((r) => r.size.length > 0);

  // A size entered twice would violate the (productId, size) unique index and
  // fail as a raw database error, so it is collapsed here instead — last entry
  // wins, matching how the form behaves.
  const bySize = new Map(rows.map((r) => [r.size, r]));
  const variants = [...bySize.values()];

  // sizeStock is not a Product column, so it is dropped from the spread and
  // written as variant rows instead.
  const { sizeStock, ...columns } = input;
  void sizeStock;
  return {
    variants,
    columns: {
      ...columns,
      sizes: variants.map((v) => v.size),
      stock: variants.length > 0 ? variants.reduce((sum, v) => sum + v.stock, 0) : input.stock,
    },
  };
}

export async function createProduct(input: ProductInput) {
  validateMedia(input);
  const slug = await uniqueProductSlug(input.name);
  const { columns, variants } = splitVariants(input);
  return prisma.product.create({
    data: {
      ...columns,
      slug,
      compareAtPrice: input.compareAtPrice ?? null,
      videoUrl: input.videoUrl || null,
      weight: input.weight ?? null,
      purity: input.purity || "925 Sterling Silver",
      tags: input.tags.map((t) => t.toLowerCase()),
      isActive: input.isActive ?? true,
      variants: { create: variants },
    },
  });
}

export async function updateProduct(id: string, input: ProductInput) {
  validateMedia(input);
  const { columns, variants } = splitVariants(input);

  // One transaction: the product total and its variant rows must never be
  // observable in disagreement.
  return prisma.$transaction(async (tx) => {
    // Sizes the admin removed are deleted outright. Any stock they held leaves
    // the total with them, which is the intended reading of "this size is no
    // longer offered".
    await tx.productVariant.deleteMany({
      where: { productId: id, size: { notIn: variants.map((v) => v.size) } },
    });

    for (const variant of variants) {
      await tx.productVariant.upsert({
        where: { productId_size: { productId: id, size: variant.size } },
        update: { stock: variant.stock },
        create: { productId: id, size: variant.size, stock: variant.stock },
      });
    }

    return tx.product.update({
      where: { id },
      data: {
        ...columns,
        compareAtPrice: input.compareAtPrice ?? null,
        videoUrl: input.videoUrl || null,
        weight: input.weight ?? null,
        tags: input.tags.map((t) => t.toLowerCase()),
      },
    });
  });
}

/** Soft delete — the product disappears from the storefront but order-item
 * snapshots and restore remain possible. */
export async function archiveProduct(id: string) {
  await prisma.product.update({ where: { id }, data: { isActive: false } });
}

export async function restoreProduct(id: string) {
  await prisma.product.update({ where: { id }, data: { isActive: true } });
}

// ─── Admin listing ──────────────────────────────────────────────────────────

/**
 * Sortable columns, as an allowlist.
 *
 * The key arrives from the query string, so it is mapped to a known orderBy
 * rather than interpolated — an arbitrary string reaching Prisma's orderBy is
 * how a listing turns into an information leak.
 */
const PRODUCT_SORTS = {
  name: (dir: SortDir) => ({ name: dir }),
  sku: (dir: SortDir) => ({ sku: dir }),
  category: (dir: SortDir) => ({ category: { name: dir } }),
  price: (dir: SortDir) => ({ price: dir }),
  stock: (dir: SortDir) => ({ stock: dir }),
  status: (dir: SortDir) => ({ isActive: dir }),
  created: (dir: SortDir) => ({ createdAt: dir }),
} as const;

export type ProductSortKey = keyof typeof PRODUCT_SORTS;
export type SortDir = "asc" | "desc";

export const PRODUCT_SORT_KEYS = Object.keys(PRODUCT_SORTS) as ProductSortKey[];

export function isProductSortKey(value: unknown): value is ProductSortKey {
  return typeof value === "string" && (PRODUCT_SORT_KEYS as string[]).includes(value);
}

export async function getAdminProducts(params: {
  q?: string;
  categoryId?: string;
  active?: "active" | "inactive";
  stock?: "in" | "out";
  flag?: "featured" | "bestseller";
  page?: number;
  sort?: string;
  dir?: string;
}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = 20;

  const where = {
    ...(params.q
      ? {
          OR: [
            { name: { contains: params.q, mode: "insensitive" as const } },
            { sku: { contains: params.q, mode: "insensitive" as const } },
            { slug: { contains: params.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(params.categoryId ? { categoryId: params.categoryId } : {}),
    ...(params.active === "active" ? { isActive: true } : {}),
    ...(params.active === "inactive" ? { isActive: false } : {}),
    ...(params.stock === "in" ? { stock: { gt: 0 } } : {}),
    ...(params.stock === "out" ? { stock: 0 } : {}),
    ...(params.flag === "featured" ? { isFeatured: true } : {}),
    ...(params.flag === "bestseller" ? { isBestseller: true } : {}),
  };

  // Newest first stays the default: it is what an admin adding stock wants to
  // see, and it is the only column with a stable, meaningful "latest".
  const sortKey: ProductSortKey = isProductSortKey(params.sort) ? params.sort : "created";
  const dir: SortDir = params.dir === "asc" ? "asc" : "desc";

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { category: { select: { name: true } } },
      orderBy: PRODUCT_SORTS[sortKey](dir),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return { products, total, page, pageSize };
}

// ─── CSV bulk import ────────────────────────────────────────────────────────

export type CsvRow = Record<string, string>;
export type RowError = { row: number; error: string };

export const CSV_TEMPLATE_HEADERS = [
  "name",
  "description",
  "shortDescription",
  "price",
  "compareAtPrice",
  "category",
  "weight",
  "purity",
  "dimensions",
  "sizes",
  "material",
  "stock",
  "sku",
  "tags",
  "isFeatured",
  "isBestseller",
  "isActive",
  "images",
] as const;

function parseBool(v: string | undefined): boolean {
  return ["true", "1", "yes"].includes((v ?? "").trim().toLowerCase());
}

function parseList(v: string | undefined): string[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Partial-success bulk import: valid rows are created, invalid rows are
 * reported per-row without failing the batch. Duplicate SKUs are rejected
 * both within the batch and against existing products. Max 500 rows.
 */
export async function bulkImportProducts(rows: CsvRow[]): Promise<{
  created: number;
  errors: RowError[];
}> {
  if (rows.length === 0) return { created: 0, errors: [] };
  if (rows.length > 500) {
    return { created: 0, errors: [{ row: 0, error: "Maximum 500 rows per import." }] };
  }

  const categories = await prisma.category.findMany();
  const categoryByKey = new Map<string, string>();
  for (const c of categories) {
    categoryByKey.set(c.name.toLowerCase(), c.id);
    categoryByKey.set(c.slug.toLowerCase(), c.id);
  }

  const existingSkus = new Set(
    (await prisma.product.findMany({ select: { sku: true } })).map((p) => p.sku.toLowerCase())
  );
  const batchSkus = new Set<string>();

  const errors: RowError[] = [];
  let created = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-based + header row, matching what users see in a spreadsheet
    try {
      const name = (row.name ?? "").trim();
      const sku = (row.sku ?? "").trim();
      const price = Number(row.price);
      const stock = Number(row.stock ?? 0);
      const weight = row.weight ? Number(row.weight) : null;
      const compareAtPrice = row.compareAtPrice ? Number(row.compareAtPrice) : null;
      const categoryKey = (row.category ?? "").trim().toLowerCase();

      if (!name) throw new Error("name is required");
      if (!sku) throw new Error("sku is required");
      if (!Number.isFinite(price) || price < 0) throw new Error("price must be a number ≥ 0");
      if (!Number.isFinite(stock) || stock < 0 || !Number.isInteger(stock))
        throw new Error("stock must be an integer ≥ 0");
      if (weight !== null && (!Number.isFinite(weight) || weight < 0))
        throw new Error("weight must be a number ≥ 0");

      const categoryId = categoryByKey.get(categoryKey);
      if (!categoryId) throw new Error(`unknown category "${row.category}"`);

      const skuKey = sku.toLowerCase();
      if (existingSkus.has(skuKey)) throw new Error(`SKU "${sku}" already exists`);
      if (batchSkus.has(skuKey)) throw new Error(`SKU "${sku}" is duplicated in this file`);

      await createProduct({
        name,
        description: (row.description ?? "").trim() || undefined,
        shortDescription: (row.shortDescription ?? "").trim() || undefined,
        price,
        compareAtPrice,
        images: parseList(row.images),
        categoryId,
        weight,
        purity: (row.purity ?? "").trim() || undefined,
        dimensions: (row.dimensions ?? "").trim() || undefined,
        // A CSV carries one stock figure and a list of sizes, so it is split
        // evenly with the remainder to the earliest sizes — the same rule the
        // 20260805190000 migration used, so imports and backfills agree.
        sizeStock: splitStockEvenly(parseList(row.sizes), stock),
        material: (row.material ?? "").trim() || undefined,
        stock,
        sku,
        tags: parseList(row.tags),
        isFeatured: parseBool(row.isFeatured),
        isBestseller: parseBool(row.isBestseller),
        isActive: row.isActive === undefined || row.isActive === "" ? true : parseBool(row.isActive),
      });

      batchSkus.add(skuKey);
      created++;
    } catch (err) {
      errors.push({ row: rowNum, error: err instanceof Error ? err.message : "invalid row" });
    }
  }

  return { created, errors };
}
