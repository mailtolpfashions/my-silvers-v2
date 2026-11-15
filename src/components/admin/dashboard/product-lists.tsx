import Link from "next/link";
import { formatINR } from "@/lib/format";

/** Best sellers in the chosen range, by sales, with units beside them. */
export function TopProducts({
  products,
  rangeLabel,
}: {
  products: Array<{ productId: string | null; name: string; units: number; revenue: number }>;
  rangeLabel: string;
}) {
  return (
    <section aria-labelledby="top-products-heading" className="rounded-lg border bg-card">
      <div className="border-b px-5 py-3">
        <h2 id="top-products-heading" className="font-semibold">
          Top products
        </h2>
        <p className="text-xs text-muted-foreground">{rangeLabel}</p>
      </div>
      {products.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">No sales in this period yet.</p>
      ) : (
        <ol className="divide-y">
          {products.map((p, i) => (
            <li key={`${p.productId}-${p.name}`} className="flex items-center gap-3 px-5 py-2.5 text-sm">
              <span className="w-4 text-xs text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">
                {p.productId ? (
                  <Link href={`/admin/products/${p.productId}`} className="hover:underline">
                    {p.name}
                  </Link>
                ) : (
                  p.name
                )}
              </span>
              <span className="text-xs text-muted-foreground">{p.units} sold</span>
              <span className="w-20 text-right font-medium tabular-nums">{formatINR(p.revenue)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Five or fewer left — restock before a customer finds it sold out. */
export function LowStock({
  products,
}: {
  products: Array<{ id: string; name: string; stock: number }>;
}) {
  return (
    <section aria-labelledby="low-stock-heading" className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h2 id="low-stock-heading" className="font-semibold">
          Low stock
        </h2>
        <Link href="/admin/inventory" className="text-sm underline underline-offset-4">
          Inventory
        </Link>
      </div>
      {products.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">Everything is well stocked.</p>
      ) : (
        <ul className="divide-y">
          {products.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
              <Link href={`/admin/products/${p.id}`} className="min-w-0 flex-1 truncate hover:underline">
                {p.name}
              </Link>
              <span
                className={`whitespace-nowrap text-xs font-medium ${
                  p.stock === 0 ? "text-[var(--state-danger-fg)]" : "text-[var(--state-warning-fg)]"
                }`}
              >
                {p.stock === 0 ? "Sold out" : `${p.stock} left`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
