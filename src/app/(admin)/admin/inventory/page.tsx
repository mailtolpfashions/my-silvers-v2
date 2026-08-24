import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require-role";
import { formatINR } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { AdminSearch } from "@/components/admin/admin-search";
import { SortableHeader } from "@/components/admin/sortable-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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


/**
 * What needs restocking.
 *
 * ── The threshold is a constant, not a setting ───────────────────────────────
 * A per-product reorder level is a real feature and this is not it. One number
 * that everyone understands beats a settings screen nobody fills in; when the
 * catalogue is big enough that one number is wrong, that is the moment to add
 * the field, and not before.
 */
const LOW_STOCK_AT = 5;

/**
 * Sortable columns for both stock tables, as an allowlist — the key comes from
 * the query string and must never reach orderBy directly. See the note in
 * server/products/admin.ts.
 */
const STOCK_SORTS = {
  piece: (dir: "asc" | "desc") => ({ name: dir }),
  sku: (dir: "asc" | "desc") => ({ sku: dir }),
  price: (dir: "asc" | "desc") => ({ price: dir }),
  stock: (dir: "asc" | "desc") => ({ stock: dir }),
} as const;

type StockSortKey = keyof typeof STOCK_SORTS;

function isStockSortKey(value: unknown): value is StockSortKey {
  return typeof value === "string" && value in STOCK_SORTS;
}

/**
 * ⚠️  The two tables sort INDEPENDENTLY, so each owns its own pair of query
 * params. A single shared `sort` would mean clicking a header in "Out of stock"
 * silently reorders "Low stock" further down the page, where the person cannot
 * see it happen.
 */
type InventorySearchParams = {
  q?: string;
  outSort?: string;
  outDir?: string;
  lowSort?: string;
  lowDir?: string;
};

export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: Promise<InventorySearchParams>;
}) {
  await requireRole("admin");

  const params = await searchParams;
  const { q } = params;
  const search = q?.trim();

  // Out of stock reads alphabetically by default — every row's stock is 0, so
  // there is nothing to rank by and a name is what you scan for.
  const outSort: StockSortKey = isStockSortKey(params.outSort) ? params.outSort : "piece";
  const outDir: "asc" | "desc" = params.outDir === "desc" ? "desc" : "asc";
  // Low stock leads with the lowest count — that is the to-do order.
  const lowSort: StockSortKey = isStockSortKey(params.lowSort) ? params.lowSort : "stock";
  const lowDir: "asc" | "desc" = params.lowDir === "desc" ? "desc" : "asc";
  // Name or SKU. Someone arriving here is either reading a shelf label or a
  // supplier's order form, and those are the two strings they will have.
  const matches = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { sku: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [low, out, sized] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true, stock: { gt: 0, lte: LOW_STOCK_AT }, ...matches },
      orderBy: STOCK_SORTS[lowSort](lowDir),
      select: { id: true, name: true, slug: true, sku: true, stock: true, price: true, images: true },
      // Bounded: a catalogue where hundreds are simultaneously out of stock is
      // a supply problem, not a list to scroll. 200 is past the point where the
      // page stops being a to-do and starts being a report.
      take: 200,
    }),
    prisma.product.findMany({
      where: { isActive: true, stock: 0, ...matches },
      orderBy: STOCK_SORTS[outSort](outDir),
      select: { id: true, name: true, slug: true, sku: true, stock: true, price: true, images: true },
      // Bounded: a catalogue where hundreds are simultaneously out of stock is
      // a supply problem, not a list to scroll. 200 is past the point where the
      // page stops being a to-do and starts being a report.
      take: 200,
    }),
    /**
     * Sized pieces where a SIZE is out but the product total is not.
     *
     * These are invisible on the two lists above — Product.stock is the sum
     * across variants, so a ring with 0 in size 7 and 40 in size 8 reads as
     * healthy while the size most people want cannot be bought.
     */
    prisma.productVariant.findMany({
      where: { stock: 0, product: { isActive: true, stock: { gt: 0 }, ...matches } },
      orderBy: [{ product: { name: "asc" } }, { size: "asc" }],
      select: { id: true, size: true, product: { select: { id: true, name: true, slug: true, sku: true } } },
      take: 200,
    }),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Inventory"
        description={`Pieces that are out of stock, or down to ${LOW_STOCK_AT} or fewer.`}
      />

      <AdminSearch action="/admin/inventory" placeholder="Search by name or SKU" value={q} />

      <Section
        title="Out of stock"
        empty="Nothing is out of stock."
        products={out}
        tone="text-destructive"
        sortKey="outSort"
        dirKey="outDir"
        currentSort={outSort}
        currentDir={outDir}
        params={params}
      />

      <Section
        title={`Low stock (${LOW_STOCK_AT} or fewer)`}
        empty="Nothing is running low."
        products={low}
        sortKey="lowSort"
        dirKey="lowDir"
        currentSort={lowSort}
        currentDir={lowDir}
        params={params}
      />

      <section className="space-y-3">
        <h2 className="text-base font-medium">Sizes out of stock</h2>
        <p className="text-sm text-muted-foreground">
          The piece still shows as in stock because other sizes are available, so these never appear
          in the lists above.
        </p>
        {sized.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Every size of every piece is available.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-wrap gap-2 p-4">
              {sized.map((variant) => (
                <Link
                  key={variant.id}
                  href={`/admin/products/${variant.product.id}`}
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                >
                  {variant.product.name}{" "}
                  <span className="text-muted-foreground">size {variant.size}</span>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

function Section({
  title,
  empty,
  products,
  tone = "",
  sortKey,
  dirKey,
  currentSort,
  currentDir,
  params,
}: {
  title: string;
  empty: string;
  products: Array<{
    id: string;
    name: string;
    slug: string;
    sku: string;
    stock: number;
    price: { toString(): string };
    images: string[];
  }>;
  tone?: string;
  /** This table's own query-param names — see InventorySearchParams. */
  sortKey: string;
  dirKey: string;
  currentSort: StockSortKey;
  currentDir: "asc" | "desc";
  params: InventorySearchParams;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-medium">
        {title} <span className="text-muted-foreground">({products.length})</span>
      </h2>
      {products.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">{empty}</CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  {(
                    [
                      ["piece", "Piece", ""],
                      ["sku", "SKU", ""],
                      ["price", "Price", ""],
                      ["stock", "In stock", "text-right"],
                    ] as const
                  ).map(([column, label, className]) => (
                    <SortableHeader
                      key={column}
                      basePath="/admin/inventory"
                      column={column}
                      label={label}
                      currentSort={currentSort}
                      currentDir={currentDir}
                      params={params}
                      sortKey={sortKey}
                      dirKey={dirKey}
                      className={className}
                    />
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <Link
                        href={`/admin/products/${product.id}`}
                        className="flex items-center gap-3 underline-offset-4 hover:underline"
                      >
                        <span className="relative size-10 shrink-0 overflow-hidden bg-muted">
                          {product.images[0] && (
                            <Image src={product.images[0]} alt="" fill sizes="40px" className="object-cover" />
                          )}
                        </span>
                        {product.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{product.sku}</TableCell>
                    <TableCell>{formatINR(product.price.toString())}</TableCell>
                    <TableCell className={`text-right font-medium ${tone}`}>{product.stock}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
