import Link from "next/link";
import { PackageCheck, Truck } from "lucide-react";
import { formatINR } from "@/lib/format";
import { Button } from "@/components/ui/button";

export type ToShipRow = {
  id: string;
  orderNumber: string;
  createdAt: Date;
  total: number;
  cod: boolean;
  /** The account that placed the order. */
  customer: string;
  /** The name on the delivery address, when there is one. */
  recipient: string | null;
  city: string | null;
  items: number;
};

const HOUR = 60 * 60 * 1000;

/** "12 min", "3 h", "2 days" — how long a paid customer has been waiting. */
function waited(ms: number) {
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(ms / HOUR);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(ms / (24 * HOUR));
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * The first thing on the dashboard: orders the customer has paid for (or
 * COD), not yet shipped, oldest first — because the oldest is the one most
 * likely to turn into a "where is my order?" call.
 *
 * Exists because a paid order once sat unnoticed: it was only ever one line in
 * "Recent orders". The definition is TO_SHIP_WHERE in server/admin/dashboard.ts.
 *
 * Waiting time escalates: amber after a day, red after two. Colour is never
 * the only signal — the wait is written out as well.
 */
export function ToShipCard({
  rows,
  count,
  now,
}: {
  rows: ToShipRow[];
  count: number;
  now: number;
}) {
  if (count === 0) {
    return (
      <section className="flex items-center gap-3 rounded-lg border bg-card p-5">
        <PackageCheck className="size-6 shrink-0 text-[var(--state-success-fg)]" aria-hidden />
        <div>
          <h2 className="font-semibold">All caught up</h2>
          <p className="text-sm text-muted-foreground">Nothing is waiting to be shipped.</p>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="to-ship-heading"
      className="overflow-hidden rounded-lg border-2 border-foreground bg-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-foreground px-5 py-3 text-background">
        <h2 id="to-ship-heading" className="flex items-center gap-2 font-semibold text-background">
          <Truck className="size-5" aria-hidden />
          {count} order{count === 1 ? "" : "s"} to ship
        </h2>
        <Link
          href="/admin?tab=to-ship#recent-orders"
          className="text-sm text-background underline underline-offset-4 opacity-90 hover:opacity-100"
        >
          {count > rows.length ? `See all ${count}` : "Open the list"}
        </Link>
      </div>

      <ul className="divide-y">
        {rows.map((o) => {
          const age = now - o.createdAt.getTime();
          const tone =
            age >= 48 * HOUR
              ? "text-[var(--state-danger-fg)]"
              : age >= 24 * HOUR
                ? "text-[var(--state-warning-fg)]"
                : "text-muted-foreground";
          return (
            <li key={o.id} className="flex items-center gap-4 px-5 py-2.5">
              <div className="min-w-0 flex-1">
                {/* Two lines, not three: who and where on the first, the
                    money and the wait on the second. */}
                <p className="truncate text-sm">
                  <span className="font-semibold">{o.orderNumber}</span>
                  <span className="ml-2">{o.customer}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {o.recipient && o.recipient.toLowerCase() !== o.customer.toLowerCase()
                      ? `→ ${o.recipient}${o.city ? `, ${o.city}` : ""}`
                      : o.city
                        ? `→ ${o.city}`
                        : "· no delivery address"}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {o.items} item{o.items === 1 ? "" : "s"} · {formatINR(o.total)} ·{" "}
                  {o.cod ? "Cash on delivery" : "Paid online"} ·{" "}
                  <span className={tone}>waiting {waited(age)}</span>
                </p>
              </div>
              <Button asChild size="sm">
                <Link href={`/admin/orders/${o.id}`}>Ship</Link>
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
