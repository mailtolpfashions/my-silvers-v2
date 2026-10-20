/**
 * The product CSV columns: the downloadable template, and what the import
 * reads.
 *
 * ⚠️  The ONE list. It used to exist twice — here in the server module and as
 * a copy in csv-import-dialog.tsx, because the server module imports Prisma
 * and cannot reach the browser — with a "keep in sync" comment between them.
 * They drifted: the template shipped without costPrice and then without
 * vendor, so the columns the import accepted were missing from the file it
 * hands people to fill in. Living in lib/ with no imports, it is safe on both
 * sides, so there is nothing left to keep in sync.
 */
export const CSV_TEMPLATE_HEADERS = [
  "name",
  "description",
  "shortDescription",
  "price",
  "compareAtPrice",
  "costPrice",
  "vendor",
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
