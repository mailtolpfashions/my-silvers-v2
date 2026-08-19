import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require-role";
import { formatINR } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { AdminSearch } from "@/components/admin/admin-search";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireRole("admin");

  const { q } = await searchParams;
  const search = q?.trim();
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
      orderBy: { stock: "asc" },
      select: { id: true, name: true, slug: true, sku: true, stock: true, price: true, images: true },
      // Bounded: a catalogue where hundreds are simultaneously out of stock is
      // a supply problem, not a list to scroll. 200 is past the point where the
      // page stops being a to-do and starts being a report.
      take: 200,
    }),
    prisma.product.findMany({
      where: { isActive: true, stock: 0, ...matches },
      orderBy: { name: "asc" },
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
      />

      <Section
        title={`Low stock (${LOW_STOCK_AT} or fewer)`}
        empty="Nothing is running low."
        products={low}
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
                  <TableHead>Piece</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead className="text-right">In stock</TableHead>
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
