import Link from "next/link";
import { prisma } from "@/server/db";
import { getPublishedEntry } from "@/server/cms/entries";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/storefront/product-card";
import { HomepageView } from "@/components/storefront/cms/homepage-view";
import { InstagramFeed } from "@/components/storefront/instagram-feed";

export default async function HomePage() {
  const [homepage, featured] = await Promise.all([
    getPublishedEntry("homepage"),
    prisma.product.findMany({
      where: { isActive: true, isFeatured: true },
      include: { category: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  return (
    <div>
      {homepage ? (
        <HomepageView data={homepage.data} />
      ) : (
        // Static fallback until the CMS homepage is published.
        <section className="mx-auto max-w-6xl px-4 py-20 text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
            925 Sterling Silver
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            Jewellery, crafted for everyday wear.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Timeless sterling silver pieces — rings, earrings, and more — designed
            to be worn every day, not just on special occasions.
          </p>
          <Button asChild size="lg" className="mt-8">
            <Link href="/products">Shop the collection</Link>
          </Button>
        </section>
      )}

      {featured.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="mb-6 text-xl font-semibold">Featured</h2>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
            {featured.map((product) => (
              <ProductCard
                key={product.id}
                product={{
                  id: product.id,
                  name: product.name,
                  slug: product.slug,
                  price: product.price.toString(),
                  compareAtPrice: product.compareAtPrice?.toString() ?? null,
                  images: product.images,
                  isBestseller: product.isBestseller,
                  isFeatured: product.isFeatured,
                  categoryName: product.category.name,
                }}
              />
            ))}
          </div>
        </section>
      )}

      <InstagramFeed />
    </div>
  );
}
