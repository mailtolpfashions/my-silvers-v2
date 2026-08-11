import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { ProductForm, type ProductFormValues } from "@/components/admin/product-form";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [product, categories] = await Promise.all([
    prisma.product.findUnique({ where: { id }, include: { variants: true } }),
    prisma.category.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  if (!product) notFound();

  const initial: ProductFormValues = {
    name: product.name,
    description: product.description ?? "",
    shortDescription: product.shortDescription ?? "",
    price: product.price.toString(),
    compareAtPrice: product.compareAtPrice?.toString() ?? "",
    images: product.images,
    videoUrl: product.videoUrl,
    categoryId: product.categoryId,
    weight: product.weight?.toString() ?? "",
    purity: product.purity,
    dimensions: product.dimensions ?? "",
    // Ordered by Product.sizes, not by however the variant rows come back, so
    // the admin sees them in the same order a shopper does.
    sizeStock: product.sizes.map((size) => ({
      size,
      stock: String(product.variants.find((v) => v.size === size)?.stock ?? 0),
    })),
    material: product.material ?? "",
    stock: String(product.stock),
    sku: product.sku,
    isFeatured: product.isFeatured,
    isBestseller: product.isBestseller,
    isActive: product.isActive,
    tags: product.tags.join(", "),
  };

  return (
    <div className="space-y-6">
      <h1 className="text-h2 font-semibold">Edit product</h1>
      <ProductForm productId={product.id} initial={initial} categories={categories} />
    </div>
  );
}
