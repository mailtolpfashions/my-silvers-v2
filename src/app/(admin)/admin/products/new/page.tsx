import { prisma } from "@/server/db";
import { ProductForm, EMPTY_PRODUCT_FORM } from "@/components/admin/product-form";
import { PageHeader } from "@/components/layout/page-header";

export default async function NewProductPage() {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add product"
        description="A product is only visible on the storefront once it is active and has stock."
        backHref="/admin/products"
        backLabel="All products"
      />
      <ProductForm initial={EMPTY_PRODUCT_FORM} categories={categories} />
    </div>
  );
}
