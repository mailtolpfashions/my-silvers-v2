import { prisma } from "@/server/db";
import { CategoryManager } from "@/components/admin/category-manager";
import { PageHeader } from "@/components/layout/page-header";

/** Blocking, like every other admin route — see admin/reviews/page.tsx. */
export const instant = false;

export default async function AdminCategoriesPage() {
  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: true } } },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories"
        description="Categories drive the storefront's navigation and the homepage's category band. A category with no image is skipped by that band."
      />
      <CategoryManager
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          description: c.description ?? "",
          image: c.image,
          icon: c.icon,
          sortOrder: c.sortOrder,
          isActive: c.isActive,
          productCount: c._count.products,
        }))}
      />
    </div>
  );
}
