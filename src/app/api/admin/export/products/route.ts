import { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { getCurrentRole } from "@/server/auth/require-role";
import { toCsv, csvResponse } from "@/server/admin/csv";
import { BULK_LIMIT } from "@/server/products/admin";
import { CSV_EXPORT_EXTRA_HEADERS, CSV_TEMPLATE_HEADERS } from "@/lib/product-csv";

/**
 * Product export.
 *
 *   GET            the whole catalogue (the page's Export button with nothing
 *                  ticked), or `?ids=` for the PDF builder's small selections.
 *   POST ids=a,b…  a selection, as a form post — see ProductExportButtons.
 *
 * ── Why POST for a selection ────────────────────────────────────────────────
 * The ids used to travel in the URL, which has a practical length limit, so a
 * selection was capped at 200. "Select all matching" now selects up to
 * BULK_LIMIT, and a 1,000-row selection exporting 200 without saying so is
 * exactly the quiet discrepancy the bulk tools are built to avoid. A form body
 * has no such limit; the browser still downloads the response as a file.
 */
export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get("ids");
  const ids = idsParam ? idsParam.split(",") : null;
  return exportProducts(ids, req.nextUrl.searchParams.get("format") === "json");
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const raw = form.get("ids");
  return exportProducts(typeof raw === "string" ? raw.split(",") : null, false);
}

async function exportProducts(rawIds: string[] | null, asJson: boolean) {
  // getCurrentRole(), not session.user.role: the token carries the role from
  // sign-in and never refreshes it, so a revoked admin could still pull a full
  // CSV of this data for as long as their session lasted. See require-role.ts.
  if ((await getCurrentRole()) !== "admin") return new Response("Forbidden", { status: 403 });

  const ids = rawIds
    ? rawIds.map((s) => s.trim()).filter(Boolean).slice(0, BULK_LIMIT)
    : null;

  const products = await prisma.product.findMany({
    where: ids && ids.length > 0 ? { id: { in: ids } } : undefined,
    include: { category: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  // ?format=json powers the client-side PDF builder (jsPDF is lazy-loaded in
  // the browser rather than bundled server-side).
  if (asJson) {
    return Response.json({
      title: "Products",
      headers: ["Name", "SKU", "Category", "Price", "Stock", "Status"],
      rows: products.map((p) => [
        p.name,
        p.sku,
        p.category.name,
        p.price.toString(),
        String(p.stock),
        p.isActive ? "Active" : "Archived",
      ]),
    });
  }

  /**
   * Exactly the import template's columns, in its order, then the read-only
   * extras. So an exported file IS a filled-in template: edit it in a
   * spreadsheet and re-import, and every column — description included, which
   * this export used to leave out — goes back where it came from.
   *
   * Every template column must have a value here; the Record type makes a
   * column added to the template without one a type error rather than an
   * empty column nobody notices.
   */
  const csv = toCsv(
    [...CSV_TEMPLATE_HEADERS, ...CSV_EXPORT_EXTRA_HEADERS],
    products.map((p) => {
      const row: Record<(typeof CSV_TEMPLATE_HEADERS)[number] | (typeof CSV_EXPORT_EXTRA_HEADERS)[number], string | number | boolean> = {
        name: p.name,
        description: p.description ?? "",
        shortDescription: p.shortDescription ?? "",
        price: p.price.toString(),
        compareAtPrice: p.compareAtPrice?.toString() ?? "",
        costPrice: p.costPrice?.toString() ?? "",
        vendor: p.vendor ?? "",
        category: p.category.name,
        weight: p.weight?.toString() ?? "",
        purity: p.purity,
        dimensions: p.dimensions ?? "",
        sizes: p.sizes.join(","),
        material: p.material ?? "",
        stock: p.stock,
        sku: p.sku,
        tags: p.tags.join(","),
        isFeatured: p.isFeatured,
        isBestseller: p.isBestseller,
        isActive: p.isActive,
        images: p.images.join(","),
        videoUrl: p.videoUrl ?? "",
        slug: p.slug,
        createdAt: p.createdAt.toISOString(),
      };
      return [...CSV_TEMPLATE_HEADERS, ...CSV_EXPORT_EXTRA_HEADERS].map((h) => row[h]);
    })
  );

  return csvResponse(csv, "products.csv");
}
