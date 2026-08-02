import { NextRequest } from "next/server";
import { prisma } from "@/server/db";

/**
 * Public product summaries for the GUEST cart — the client stores only
 * {productId, quantity} in localStorage and hydrates display data from here.
 * Returns only fields that are already public on the storefront.
 */
export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 50);
  if (ids.length === 0) return Response.json({ products: [] });

  const products = await prisma.product.findMany({
    where: { id: { in: ids }, isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      price: true,
      images: true,
      stock: true,
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
  });
}
