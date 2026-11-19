import Link from "next/link";
import type { Order } from "@/generated/prisma/client";
import { formatINR } from "@/lib/format";
import { unpaidState } from "@/lib/order-payment";
import type { RecentTab } from "@/server/admin/dashboard";
import { REFUND_STARTED } from "@/lib/payment-labels";

type Row = Order & { user: { name: string | null; email: string } };

/**
 * Two separate questions per order, the way Shopify asks them: has the money
 * come in (Payment), and has the parcel gone out (Fulfilment). The old list
 * showed one "Placed" badge that answered neither.
 */
function payment(o: Row): { text: string; tone: "ok" | "warn" | "bad" | "muted" } {
  if (o.paymentStatus === "refunded") return { text: REFUND_STARTED, tone: "muted" };
  if (o.paymentMethod === "cod") return { text: "COD", tone: "muted" };
  if (o.paymentStatus === "paid") return { text: "Paid", tone: "ok" };
  const u = unpaidState(o);
  if (u === "failed") return { text: "Failed", tone: "bad" };
  if (u === "confirming") return { text: "Confirming", tone: "warn" };
  // Cancelled before any money came in — say so, rather than a bare dash
  // that reads as missing data.
  if (o.orderStatus === "cancelled") return { text: "Not paid", tone: "muted" };
  return { text: "Unpaid", tone: "warn" };
}

function fulfilment(o: Row): { text: string; tone: "ok" | "warn" | "bad" | "muted" } {
  switch (o.orderStatus) {
    case "shipped":
      return { text: "Shipped", tone: "ok" };
    case "delivered":
      return { text: "Delivered", tone: "ok" };
    case "cancelled":
      return { text: "Cancelled", tone: "muted" };
    case "return_requested":
      return { text: "Return requested", tone: "bad" };
    case "returned":
      return { text: "Returned", tone: "muted" };
    case "refunded":
      return { text: REFUND_STARTED, tone: "muted" };
    default: {
      const ready = o.paymentStatus === "paid" || o.paymentMethod === "cod";
      if (o.shipmentCreatedAt) return { text: "Shipment booked", tone: "ok" };
      if (ready) return { text: "To ship", tone: "warn" };
      // Not ready means an online order with no payment: still waiting for it,
      // or it failed and this order will never go out.
      return unpaidState(o) === "failed"
        ? { text: "Won't ship", tone: "muted" }
        : { text: "Awaiting payment", tone: "muted" };
    }
  }
}

const TONES = {
  ok: "border-[var(--state-success-fg)]/30 text-[var(--state-success-fg)]",
  warn: "border-[var(--state-warning-fg)]/40 bg-[var(--state-warning)] text-[var(--state-warning-fg)]",
  bad: "border-[var(--state-danger-fg)]/30 text-[var(--state-danger-fg)]",
  muted: "border-border text-muted-foreground",
} as const;

function Pill({ text, tone }: { text: string; tone: keyof typeof TONES }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${TONES[tone]}`}>
      {text}
    </span>
  );
}

const TABS: Array<[RecentTab, string]> = [
  ["all", "All"],
  ["to-ship", "To ship"],
  ["unpaid", "Unpaid"],
];

export function RecentOrdersTable({
  orders,
  tab,
  range,
}: {
  orders: Row[];
  tab: RecentTab;
  range: string;
}) {
  return (
    <section id="recent-orders" aria-labelledby="recent-orders-heading" className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
        <h2 id="recent-orders-heading" className="font-semibold">
          Recent orders
        </h2>
        <nav aria-label="Filter orders" className="flex gap-1">
          {TABS.map(([value, text]) => {
            const params = new URLSearchParams();
            if (range !== "today") params.set("range", range);
            if (value !== "all") params.set("tab", value);
            return (
              <Link
                key={value}
                href={`/admin${params.size ? `?${params}` : ""}#recent-orders`}
                aria-current={value === tab ? "page" : undefined}
                className={`rounded-full px-3 py-1 text-xs ${
                  value === tab ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {text}
              </Link>
            );
          })}
        </nav>
      </div>

      {orders.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          {tab === "to-ship"
            ? "Nothing waiting to be shipped."
            : tab === "unpaid"
              ? "No unpaid checkouts."
              : "No orders yet."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-5 py-2 font-medium">Order</th>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 font-medium">Payment</th>
                <th className="px-5 py-2 font-medium">Fulfilment</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const p = payment(o);
                const f = fulfilment(o);
                return (
                  <tr key={o.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="whitespace-nowrap px-5 py-2.5 font-medium">
                      <Link href={`/admin/orders/${o.id}`} className="hover:underline">
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className="max-w-[12rem] truncate px-3 py-2.5">{o.user?.name ?? o.user?.email}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                      {o.createdAt.toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: "Asia/Kolkata",
                      })}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                      {formatINR(o.totalAmount.toString())}
                    </td>
                    <td className="px-3 py-2.5">
                      <Pill {...p} />
                    </td>
                    <td className="px-5 py-2.5">
                      <Pill {...f} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="border-t px-5 py-2.5 text-right">
        <Link href="/admin/orders" className="text-sm underline underline-offset-4">
          All orders
        </Link>
      </div>
    </section>
  );
}
