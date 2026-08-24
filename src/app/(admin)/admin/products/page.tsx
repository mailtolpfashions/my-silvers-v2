import Link from "next/link";
import Image from "next/image";
import { getAdminProducts } from "@/server/products/admin";
import { prisma } from "@/server/db";
import { formatINR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AdminProductFilters,
  ProductRowActions,
} from "@/components/admin/product-table-controls";
import { SortableHeader } from "@/components/admin/sortable-header";
import { PageHeader } from "@/components/layout/page-header";
import { ProductHeaderActions } from "@/components/admin/product-header-actions";
import {
  BulkSelectProvider,
  BulkSelectAll,
  BulkRowCheckbox,
} from "@/components/admin/bulk-select";
import { EmptyState } from "@/components/layout/empty-state";

/**
 * A deliberately blocking route.
 *
 * `cacheComponents` requires runtime data — the session, params, cookies — to
 * sit behind a <Suspense> boundary, or the route cannot prerender a shell. On
 * the storefront that matters and those pages stream. Here it does not, and
 * saying so explicitly is more honest than wrapping a dashboard in skeletons
 * to satisfy a validator:
 *
 *   - everything on this page is per-shopkeeper and behind a login, so there
 *     is no shell worth prerendering and nothing to share between visitors;
 *   - it is opened a handful of times a day by staff, not by shoppers, so no
 *     conversion and no crawl budget rides on it;
 *   - the data IS the page. A skeleton would be replaced wholesale a moment
 *     later, which is a flicker rather than a head start.
 *
 * This is what the error's own `[block]` remedy is for. It does not change how
 * the route renders; it records that blocking is the intended behaviour.
 */
export const instant = false;

type SearchParams = Promise<{
  q?: string;
  category?: string;
  active?: string;
  stock?: string;
  flag?: string;
  page?: string;
  sort?: string;
  dir?: string;
}>;

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const [{ products, total, page, pageSize }, categories] = await Promise.all([
    getAdminProducts({
      q: params.q,
      categoryId: params.category,
      active: params.active as "active" | "inactive" | undefined,
      stock: params.stock as "in" | "out" | undefined,
      flag: params.flag as "featured" | "bestseller" | undefined,
      page: params.page ? Number(params.page) || 1 : 1,
      sort: params.sort,
      dir: params.dir,
    }),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Mirrors the defaults in getAdminProducts, so the arrow shown matches the
  // order actually applied.
  const currentSort = params.sort ?? "created";
  const currentDir: "asc" | "desc" = params.dir === "asc" ? "asc" : "desc";

  // Which empty state to show. Sort and page are excluded on purpose: neither
  // can cause an empty result, so offering "clear filters" for them would point
  // at the wrong culprit.
  const hasFilters = Boolean(
    params.q || params.category || params.active || params.stock || params.flag
  );

  return (
    // The provider wraps the WHOLE page, not just the table, so the header's
    // export buttons can read the selection — see ProductExportButtons. Row
    // checkboxes and the bulk bar are the only other things inside it that
    // care.
    <BulkSelectProvider>
    <div className="space-y-6">
      <PageHeader
        title="Products"
        actions={
          // Becomes the selection toolbar once rows are ticked, and is the ONLY
          // place the bulk actions appear — see the component.
          <ProductHeaderActions
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          />
        }
      />

      <AdminProductFilters
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        current={params}
      />

      <p className="text-sm text-muted-foreground">{total} products</p>

      {products.length === 0 ? (
        // The two empty cases are different problems and get different ways
        // out — see the note on EmptyState.
        <div className="rounded-lg border">
          {hasFilters ? (
            <EmptyState
              title="No products match these filters"
              description="Try widening the search, or clear the filters to see everything."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href="/admin/products">Clear filters</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No products yet"
              description="Add your first piece, or import a catalogue from a CSV."
              action={
                <Button asChild size="sm">
                  <Link href="/admin/products/new">Add product</Link>
                </Button>
              }
            />
          )}
        </div>
      ) : (
      <>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          {/* ⚠️  NOT sticky, and it cannot be while the wrapper scrolls
              horizontally. `overflow-x-auto` on the div above coerces
              overflow-y to `auto` as well, which makes that div a scroll
              container — so `position: sticky` on this header resolves against
              the DIV rather than the viewport. Measured: the header sat 56px
              over the first row at rest and then scrolled away entirely, which
              is the worst of both.

              Making it stick would mean giving the wrapper a bounded height so
              it scrolls internally (`max-h-[70vh] overflow-auto`, header at
              `top-0`). That is a real option but it changes the page's
              scrolling model — the table would scroll inside itself while the
              page stayed put — so it is a deliberate decision, not a tweak. */}
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <BulkSelectAll ids={products.map((p) => p.id)} />
              </TableHead>
              {(
                [
                  ["name", "Product"],
                  ["sku", "SKU"],
                  ["category", "Category"],
                  ["price", "Price"],
                  ["stock", "Stock"],
                  ["status", "Status"],
                ] as const
              ).map(([column, label]) => (
                <SortableHeader
                  key={column}
                  basePath="/admin/products"
                  column={column}
                  label={label}
                  currentSort={currentSort}
                  currentDir={currentDir}
                  params={params}
                />
              ))}
              {/* Not sortable — it holds buttons, not data. */}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="w-10">
                  <BulkRowCheckbox id={product.id} label={product.name} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                      {product.images[0] && (
                        <Image
                          src={product.images[0]}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="40px"
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      {/* The name opens the product, the way an order number
                          opens an order. It was plain text, so the only way in
                          was the Edit button at the far right of a wide row —
                          a long mouse journey from the thing you just read. */}
                      <Link
                        href={`/admin/products/${product.id}`}
                        className="block truncate text-sm font-medium underline-offset-2 hover:underline"
                      >
                        {product.name}
                      </Link>
                      <div className="flex gap-1">
                        {product.isFeatured && (
                          <Badge variant="outline" className="text-micro">
                            Featured
                          </Badge>
                        )}
                        {product.isBestseller && (
                          <Badge variant="outline" className="text-micro">
                            Bestseller
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{product.sku}</TableCell>
                <TableCell className="text-sm">{product.category.name}</TableCell>
                <TableCell className="text-sm">{formatINR(product.price.toString())}</TableCell>
                <TableCell>
                  <span className={product.stock === 0 ? "text-destructive" : ""}>
                    {product.stock}
                  </span>
                </TableCell>
                <TableCell>
                  {/* The admin surface's state pair rather than a destructive
                      badge: an archived product is a normal, reversible state,
                      not an error, and red said otherwise. */}
                  <span
                    className="state-pill"
                    data-state={product.isActive ? "success" : "neutral"}
                  >
                    {product.isActive ? "Active" : "Archived"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/admin/products/${product.id}`}>Edit</Link>
                    </Button>
                    <ProductRowActions productId={product.id} isActive={product.isActive} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      </>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && (
            <Button asChild variant="outline" size="sm">
              <Link href={`?${new URLSearchParams({ ...params, page: String(page - 1) })}`}>
                Previous
              </Link>
            </Button>
          )}
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Button asChild variant="outline" size="sm">
              <Link href={`?${new URLSearchParams({ ...params, page: String(page + 1) })}`}>
                Next
              </Link>
            </Button>
          )}
        </div>
      )}
    </div>
    </BulkSelectProvider>
  );
}
