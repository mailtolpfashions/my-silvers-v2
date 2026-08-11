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
import { CsvImportDialog } from "@/components/admin/csv-import-dialog";
import { PdfExportButton } from "@/components/admin/pdf-export-button";

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h2 font-semibold">Products</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="/api/admin/export/products">Export CSV</a>
          </Button>
          <PdfExportButton
            endpoint="/api/admin/export/products"
            filename="products.pdf"
          />
          <CsvImportDialog />
          <Button asChild size="sm">
            <Link href="/admin/products/new">Add product</Link>
          </Button>
        </div>
      </div>

      <AdminProductFilters
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        current={params}
      />

      <p className="text-sm text-muted-foreground">{total} products</p>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
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
                      <p className="truncate text-sm font-medium">{product.name}</p>
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
                  <Badge variant={product.isActive ? "secondary" : "destructive"}>
                    {product.isActive ? "Active" : "Archived"}
                  </Badge>
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
  );
}
