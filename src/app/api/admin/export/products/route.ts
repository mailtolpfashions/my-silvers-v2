import { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { auth } from "@/server/auth/auth";
import { toCsv, csvResponse } from "@/server/admin/csv";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "admin") return new Response("Forbidden", { status: 403 });

  /**
   * `?ids=a,b,c` exports just those rows — the products table's bulk bar sends
   * the current selection. Absent, the whole catalogue is exported as before,
   * so the page's own Export CSV button is unchanged.
   *
   * Capped at the same 200 the bulk actions use, and only because a URL has a
   * practical length limit; a larger selection should use the full export.
   */
  const idsParam = req.nextUrl.searchParams.get("ids");
  const ids = idsParam
    ? idsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 200)
    : null;

  const products = await prisma.product.findMany({
    where: ids && ids.length > 0 ? { id: { in: ids } } : undefined,
    include: { category: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  // ?format=json powers the client-side PDF builder (jsPDF is lazy-loaded in
  // the browser rather than bundled server-side).
  if (req.nextUrl.searchParams.get("format") === "json") {
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

  const csv = toCsv(
    [
      "name", "sku", "slug", "category", "price", "compareAtPrice", "stock",
      "weight", "purity", "dimensions", "sizes", "material", "tags",
      "isFeatured", "isBestseller", "isActive", "images", "videoUrl", "createdAt",
    ],
    products.map((p) => [
      p.name, p.sku, p.slug, p.category.name, p.price.toString(),
      p.compareAtPrice?.toString() ?? "", p.stock, p.weight?.toString() ?? "",
      p.purity, p.dimensions ?? "", p.sizes.join(","), p.material ?? "",
      p.tags.join(","), p.isFeatured, p.isBestseller, p.isActive,
      p.images.join(","), p.videoUrl ?? "", p.createdAt.toISOString(),
    ])
  );

  return csvResponse(csv, "products.csv");
}
