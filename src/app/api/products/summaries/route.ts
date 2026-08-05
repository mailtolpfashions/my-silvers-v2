import { NextRequest } from "next/server";
import { prisma } from "@/server/db";

/**
 * Public product summaries for client-side stores that keep only ids in
 * localStorage — the guest cart, and recently-viewed. Returns only fields
 * already public on the storefront.
 *
 * Two shapes, deliberately: `products` is the guest cart's existing contract
 * and must not change, `items` is the full card shape that ProductCard needs.
 * Both come from one query, so the extra key costs a few bytes rather than a
 * second round trip.
 */
export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 50);
  if (ids.length === 0) return Response.json({ products: [], items: [] });

  const products = await prisma.product.findMany({
    where: { id: { in: ids }, isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      price: true,
      compareAtPrice: true,
      images: true,
      stock: true,
      isBestseller: true,
      isFeatured: true,
      category: { select: { name: true } },
    },
  });

  return Response.json({
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: p.price.toString(),
      image: p.images[0] ?? null,
      stock: p.stock,
    })),
    items: products.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: p.price.toString(),
      compareAtPrice: p.compareAtPrice?.toString() ?? null,
      images: p.images,
      isBestseller: p.isBestseller,
      isFeatured: p.isFeatured,
      stock: p.stock,
      categoryName: p.category.name,
    })),
  });
}
