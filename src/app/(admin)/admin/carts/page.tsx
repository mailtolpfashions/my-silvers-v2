import Link from "next/link";
import Image from "next/image";
import { Mail, Phone } from "lucide-react";
import { listAbandonedCarts } from "@/server/admin/carts";
import { formatINR } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { AdminSearch } from "@/components/admin/admin-search";

/** How long ago, in words a person would use. */
function ago(date: Date): string {
  const hours = Math.floor((Date.now() - date.getTime()) / 3_600_000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/**
 * Baskets that never became orders.
 *
 * The contact details are the point of the screen — the whole reason to look at
 * an abandoned cart is to send someone a message about it.
 */
export default async function AdminCartsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const carts = await listAbandonedCarts(q);
  const total = carts.reduce((sum, c) => sum + c.value, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Abandoned carts"
        description="Signed-in shoppers with items they never checked out, untouched for at least four hours."
      />

      {/* ── Stated up front, because the number is easy to misread ──────────
          Guest carts live in the browser and never reach the database. This is
          a floor on abandoned value, not a measurement of it, and presenting it
          as the latter would be wrong in a way nobody could see from here. */}
      <div className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        Signed-in shoppers only. Guest baskets are held in the browser and never
        reach the server, so the total below is a floor — the real figure is higher by an
        unknown amount.
      </div>

      <AdminSearch
        action="/admin/carts"
        placeholder="Search by name, email or phone"
        value={q}
      />

      {carts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {q
              ? `No abandoned cart matches “${q}”.`
              : "No abandoned carts. Every signed-in basket is either fresh or already ordered."}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-6 text-sm">
            <span>
              <span className="text-muted-foreground">Carts</span>{" "}
              <span className="font-medium">{carts.length}</span>
            </span>
            <span>
              <span className="text-muted-foreground">Value at risk</span>{" "}
              <span className="font-medium">{formatINR(total)}</span>
            </span>
          </div>

          <div className="space-y-3">
            {carts.map((cart) => (
              <Card key={cart.cartId}>
                <CardContent className="space-y-4 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                    <div className="min-w-0">
                      <p className="font-medium">{cart.customerName}</p>
                      <p className="text-sm text-muted-foreground">
                        {cart.email}
                        {cart.phone ? ` · ${cart.phone}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Last touched {ago(cart.lastActivity)} ·{" "}
                        {cart.orderCount === 0
                          ? "never ordered"
                          : `${cart.orderCount} previous order${cart.orderCount === 1 ? "" : "s"}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="text-lg font-semibold">{formatINR(cart.value)}</span>
                      {/* Real mailto/tel links rather than a "contact" button
                          that opens a form nobody has built. */}
                      <a
                        href={`mailto:${cart.email}?subject=${encodeURIComponent("Your MY Silvers basket")}`}
                        className="inline-flex size-9 items-center justify-center rounded-md border hover:bg-muted"
                        aria-label={`Email ${cart.customerName}`}
                      >
                        <Mail className="size-4" />
                      </a>
                      {cart.phone && (
                        <a
                          href={`tel:${cart.phone}`}
                          className="inline-flex size-9 items-center justify-center rounded-md border hover:bg-muted"
                          aria-label={`Call ${cart.customerName}`}
                        >
                          <Phone className="size-4" />
                        </a>
                      )}
                    </div>
                  </div>

                  <ul className="flex flex-wrap gap-3">
                    {cart.items.map((item, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <span className="relative size-10 overflow-hidden bg-muted">
                          {item.image && (
                            <Image src={item.image} alt="" fill sizes="40px" className="object-cover" />
                          )}
                        </span>
                        <span>
                          <Link
                            href={`/products/${item.slug}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {item.name}
                          </Link>
                          <span className="block text-xs text-muted-foreground">
                            {item.quantity} × {formatINR(item.price)}
                            {item.size ? ` · size ${item.size}` : ""}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
