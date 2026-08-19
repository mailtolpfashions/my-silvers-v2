import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require-role";
import { formatINR } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";

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

export default async function AdminInventoryPage() {
  await requireRole("admin");

  const [low, out, sized] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true, stock: { gt: 0, lte: LOW_STOCK_AT } },
      orderBy: { stock: "asc" },
      select: { id: true, name: true, slug: true, sku: true, stock: true, price: true, images: true },
    }),
    prisma.product.findMany({
      where: { isActive: true, stock: 0 },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, sku: true, stock: true, price: true, images: true },
    }),
    /**
     * Sized pieces where a SIZE is out but the product total is not.
     *
     * These are invisible on the two lists above — Product.stock is the sum
     * across variants, so a ring with 0 in size 7 and 40 in size 8 reads as
     * healthy while the size most people want cannot be bought.
     */
    prisma.productVariant.findMany({
      where: { stock: 0, product: { isActive: true, stock: { gt: 0 } } },
      orderBy: [{ product: { name: "asc" } }, { size: "asc" }],
      select: { id: true, size: true, product: { select: { id: true, name: true, slug: true, sku: true } } },
    }),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Inventory"
        description={`Pieces that are out of stock, or down to ${LOW_STOCK_AT} or fewer.`}
      />

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
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Piece</th>
                  <th className="px-4 py-3 font-medium">SKU</th>
                  <th className="px-4 py-3 font-medium">Price</th>
                  <th className="px-4 py-3 text-right font-medium">In stock</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
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
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{product.sku}</td>
                    <td className="px-4 py-3">{formatINR(product.price.toString())}</td>
                    <td className={`px-4 py-3 text-right font-medium ${tone}`}>{product.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
