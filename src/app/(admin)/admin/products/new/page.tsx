import { prisma } from "@/server/db";
import { CATEGORY_ORDER } from "@/server/products/category-order";
import { ProductForm, EMPTY_PRODUCT_FORM } from "@/components/admin/product-form";
import { PageHeader } from "@/components/layout/page-header";
import { FreshOnNavigate } from "@/components/layout/fresh-on-navigate";
import { listVendors } from "@/server/products/admin";
import { costingContextForViewer } from "@/server/products/costing";

/**
 * Blocking, like every other admin route — see admin/reviews/page.tsx.
 *
 * The other route that was missing this export. It reads the category list in
 * the page body, so it has the same uncached-data problem /cms had; it simply
 * has not been opened with the dev overlay watching.
 */
export const instant = false;

export default async function NewProductPage() {
  const [categories, vendors, costing] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: CATEGORY_ORDER,
      select: { id: true, name: true },
    }),
    listVendors(),
    costingContextForViewer(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add product"
        description="A product is only visible on the storefront once it is active and has stock."
        backHref="/admin/products"
        backLabel="All products"
      />
      {/* The routine in five lines, for partners who add a product now and
          then. Open by default would push the form down on every visit;
          one click away is enough. */}
      <details className="rounded-lg border p-4 text-sm">
        <summary className="cursor-pointer font-medium">How to add a product</summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-muted-foreground">
          <li>
            Fill in the <strong className="text-foreground">name</strong>, then the{" "}
            <strong className="text-foreground">SKU and category</strong> (photos are named after them).
          </li>
          <li>
            <strong className="text-foreground">Upload photos</strong> — the first one is the main photo.
          </li>
          <li>
            Under Pricing, type the <strong className="text-foreground">silver weight</strong>, the{" "}
            <strong className="text-foreground">silver rate</strong> the piece was bought at and its{" "}
            <strong className="text-foreground">making charge</strong> — the price fills itself.
          </li>
          <li>
            Enter the <strong className="text-foreground">stock</strong>, or add sizes with stock for each.
          </li>
          <li>
            Press <strong className="text-foreground">Save</strong>. Adding many at once? Use Import CSV
            and Bulk photos on the Products page.
          </li>
        </ol>
      </details>
      {/* Blank on every "Add product" click — see FreshOnNavigate. */}
      <FreshOnNavigate>
        <ProductForm
          initial={EMPTY_PRODUCT_FORM}
          categories={categories}
          vendors={vendors}
          costing={costing}
        />
      </FreshOnNavigate>
    </div>
  );
}
