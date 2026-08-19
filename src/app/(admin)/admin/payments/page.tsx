import Link from "next/link";
import { listPayments, paymentCounts, type PaymentFilter } from "@/server/admin/payments";
import { formatINR } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CopyButton } from "@/components/admin/copy-button";

const FILTERS: Array<{ key: PaymentFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "paid", label: "Captured" },
  { key: "pending", label: "Pending" },
  { key: "failed", label: "Failed" },
  { key: "refunds", label: "Refunds" },
  { key: "cod", label: "COD" },
];

/** Payment status → the two words a person actually wants, plus a tone. */
const PAYMENT_TONE: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-900",
  pending: "bg-amber-100 text-amber-900",
  paying: "bg-amber-100 text-amber-900",
  failed: "bg-red-100 text-red-900",
  refunded: "bg-muted text-foreground",
};

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const filter = (FILTERS.find((f) => f.key === sp.filter)?.key ?? "all") as PaymentFilter;
  const page = Number(sp.page) > 0 ? Number(sp.page) : 1;

  const [{ rows, total, pageSize }, counts] = await Promise.all([
    listPayments({ filter, page }),
    paymentCounts(),
  ]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { filter, page: String(page), ...patch };
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== "all" && !(k === "page" && v === "1")) params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `/admin/payments?${qs}` : "/admin/payments";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Every order as a money movement: what was captured, what is stuck, and what went back."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Captured" value={formatINR(counts.captured)} hint={`${counts.paid} orders`} />
        <Figure label="Refunded" value={formatINR(counts.refunded)} hint="completed refunds only" />
        <Figure label="Awaiting payment" value={String(counts.pending)} hint="includes stuck 'paying'" />
        <Figure label="Failed" value={String(counts.failed)} hint="never captured" />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count = counts[f.key === "all" ? "all" : f.key];
          const active = f.key === filter;
          return (
            <Link
              key={f.key}
              href={href({ filter: f.key, page: undefined })}
              className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                active ? "border-foreground bg-foreground text-background" : "hover:bg-muted"
              }`}
            >
              {f.label}
              <span className={active ? "opacity-70" : "text-muted-foreground"}>{count}</span>
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nothing here.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Razorpay payment</th>
                  <th className="px-4 py-3 font-medium">Refund</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/orders/${row.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {row.orderNumber}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {row.createdAt.toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {row.user.name ?? "—"}
                      <span className="block text-xs text-muted-foreground">{row.user.email}</span>
                    </td>
                    <td className="px-4 py-3 uppercase">{row.paymentMethod}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${PAYMENT_TONE[row.paymentStatus] ?? "bg-muted"}`}
                      >
                        {row.paymentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {row.razorpayPaymentId ? (
                        // Copyable, because the only reason to look at this
                        // string is to paste it into the Razorpay dashboard.
                        <span className="flex items-center gap-1">
                          <code className="text-xs">{row.razorpayPaymentId}</code>
                          <CopyButton value={row.razorpayPaymentId} />
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.refundStatus === "idle" ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span>
                          {row.refundStatus}
                          {row.refundAmount && (
                            <span className="block text-xs text-muted-foreground">
                              {formatINR(row.refundAmount.toString())}
                              {row.refundProcessedAt
                                ? ` · ${row.refundProcessedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
                                : ""}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatINR(row.totalAmount.toString())}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {pages} — {total} orders
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={href({ page: String(page - 1) })} className="rounded-md border px-3 py-1.5 hover:bg-muted">
                Previous
              </Link>
            )}
            {page < pages && (
              <Link href={href({ page: String(page + 1) })} className="rounded-md border px-3 py-1.5 hover:bg-muted">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
