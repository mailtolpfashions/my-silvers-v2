import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { auth } from "@/server/auth/auth";
import { getCartQuantityMap, getWishlistProductIds } from "@/server/cart";
import { searchProducts } from "@/server/products/search";
import { ProductCard } from "@/components/storefront/product-card";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const category = await prisma.category.findFirst({
    where: { slug, isActive: true },
  });
  if (!category) notFound();

  const { items, total } = await searchProducts({ categorySlug: slug });

  const session = await auth();
  const userId = session?.user?.id;
  const [wishlistIds, cartQuantities] = userId
    ? await Promise.all([getWishlistProductIds(userId), getCartQuantityMap(userId)])
    : [new Set<string>(), new Map<string, number>()];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold">{category.name}</h1>
      {category.description && (
        <p className="mt-1 text-sm text-muted-foreground">{category.description}</p>
      )}
      <p className="mt-1 text-sm text-muted-foreground">{total} products</p>

      {items.length === 0 ? (
        <p className="mt-16 text-center text-muted-foreground">
          No products in this category yet.
        </p>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              isAuthed={!!userId}
              inWishlist={wishlistIds.has(product.id)}
              cartQuantity={cartQuantities.get(product.id) ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
