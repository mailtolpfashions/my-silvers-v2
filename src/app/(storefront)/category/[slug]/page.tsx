import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getCategoryBanner, type LiveBanner } from "@/server/cms/banners";
import { prisma } from "@/server/db";
import { searchProducts } from "@/server/products/search";
import { ProductCard, productMorphName, PRODUCT_GRID_CLASS } from "@/components/storefront/product-card";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = await prisma.category.findFirst({ where: { slug, isActive: true } });
  // noindex for unknown slugs — see the note in collections/[slug]/page.tsx.
  if (!category) return { title: "Not found", robots: { index: false, follow: false } };
  return { title: category.name, description: category.description ?? undefined };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // The listing no longer depends on the category row, so all three can be in
  // flight at once — this used to be a two-step waterfall.
  const [category, { items, total }, banner] = await Promise.all([
    prisma.category.findFirst({ where: { slug, isActive: true } }),
    searchProducts({ categorySlug: slug }),
    getCategoryBanner(slug),
  ]);
  if (!category) notFound();

  return (
    <div className="container-page py-10">
      <h1 className="text-h1">{category.name}</h1>
      {category.description && (
        <p className="mt-1 text-sm text-muted-foreground">{category.description}</p>
      )}
      <p className="mt-1 text-sm text-muted-foreground">{total} products</p>

      {/* Merchandising slot, driven by a `category` banner in the CMS. Set the
          position to `category:<slug>` to target one category, or plain
          `category` for a banner shared across all of them. */}
      {banner && <CategoryBanner banner={banner} />}

      {items.length === 0 ? (
        <p className="mt-16 text-center text-muted-foreground">
          No products in this category yet.
        </p>
      ) : (
        <div className={`mt-8 ${PRODUCT_GRID_CLASS}`}>
          {items.map((product) => (
            <ProductCard key={product.id} product={product} morphName={productMorphName(product.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** The category-page banner: same 16:5 shape as the homepage's. */
function CategoryBanner({ banner }: { banner: LiveBanner }) {
  const inner = (
    <div className="relative mt-8 aspect-[16/5] w-full overflow-hidden rounded-md bg-muted">
      <Image
        src={banner.image}
        alt={banner.title ?? ""}
        fill
        className="object-cover"
        sizes="(max-width: 1600px) 100vw, 1600px"
      />
      {banner.title && (
        <>
          <div className="absolute inset-0 bg-gradient-to-r from-graphite-950/60 to-transparent" />
          <div className="absolute inset-y-0 left-0 flex max-w-md flex-col justify-center p-6 sm:p-10">
            <p className="font-heading text-2xl text-white sm:text-3xl">{banner.title}</p>
          </div>
        </>
      )}
    </div>
  );

  return banner.link ? (
    <Link href={banner.link} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}
