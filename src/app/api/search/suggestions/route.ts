import { NextRequest } from "next/server";
import { prisma } from "@/server/db";

/**
 * Typeahead suggestions for the header search box.
 *
 * Uses ILIKE rather than the `searchVector` full-text column: tsquery matches
 * whole lexemes, so "oxi" would never match "oxidised" — useless while someone
 * is still typing. Full-text still powers the actual results page.
 *
 * Only public catalogue data is returned, and sold-out pieces are excluded to
 * match the storefront listings.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();

  // Below two characters every query matches almost everything.
  if (q.length < 2) {
    return Response.json({ products: [], categories: [] });
  }

  // Cap the input so a pathological string can't drive an expensive scan, and
  // escape LIKE wildcards — Prisma's `contains` passes % and _ straight
  // through, so a query of "%%%" would otherwise match the entire catalogue.
  const term = q.slice(0, 60).replace(/[%_\\]/g, (ch) => `\\${ch}`);

  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: {
        isActive: true,
        stock: { gt: 0 },
        name: { contains: term, mode: "insensitive" },
      },
      select: { id: true, name: true, slug: true, images: true, price: true },
      orderBy: [{ isBestseller: "desc" }, { createdAt: "desc" }],
      take: 6,
    }),
    prisma.category.findMany({
      where: { isActive: true, name: { contains: term, mode: "insensitive" } },
      select: { name: true, slug: true },
      orderBy: { sortOrder: "asc" },
      take: 3,
    }),
  ]);

  return Response.json({
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      image: p.images[0] ?? null,
      price: p.price.toString(),
    })),
    categories,
  });
}
