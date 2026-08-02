import { prisma } from "@/server/db";
import { ProductForm, EMPTY_PRODUCT_FORM } from "@/components/admin/product-form";

export default async function NewProductPage() {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Add product</h1>
      <ProductForm initial={EMPTY_PRODUCT_FORM} categories={categories} />
    </div>
  );
}
