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
  "videoUrl",
  // ── Costing, OWNER ONLY (internal — never shown to customers). The import
  // reads them only when the owner imports; for staff they are ignored.
  //   silverWeight   net silver, grams
  //   silverRate     ₹ per gram — blank uses Settings → Costing
  //   makingCharge   ₹ per gram — blank uses Settings → Costing
  // With silverWeight filled and price left blank on a NEW product, the price
  // is the costing calculator's suggestion for the target margin.
  "silverWeight",
  "silverRate",
  "makingCharge",
] as const;

/**
 * Read-only columns the EXPORT adds after the template's. The import ignores
 * any column it doesn't know, so an exported file re-imports as it stands.
 */
export const CSV_EXPORT_EXTRA_HEADERS = ["slug", "createdAt"] as const;
