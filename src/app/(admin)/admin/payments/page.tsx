import Link from "next/link";
import {
  listPayments,
  paymentCounts,
  isPaymentSortKey,
  type PaymentFilter,
  type PaymentSortKey,
} from "@/server/admin/payments";
import { formatINR } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CopyButton } from "@/components/admin/copy-button";
import { FilterTabs } from "@/components/admin/filter-tabs";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { SortableHeader } from "@/components/admin/sortable-header";

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
  searchParams: Promise<{ filter?: string; page?: string; sort?: string; dir?: string }>;
}) {
  const sp = await searchParams;
  const filter = (FILTERS.find((f) => f.key === sp.filter)?.key ?? "all") as PaymentFilter;
  const page = Number(sp.page) > 0 ? Number(sp.page) : 1;

  // Newest first by default — this screen is read as a feed of what just
  // happened to the money, so the default has to stay date-descending.
  const currentSort: PaymentSortKey = isPaymentSortKey(sp.sort) ? sp.sort : "order";
  const currentDir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";

  const [{ rows, total, pageSize }, counts] = await Promise.all([
    listPayments({ filter, page, sort: currentSort, dir: currentDir }),
    paymentCounts(),
  ]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    // sort/dir ride along so paging and switching tabs keep the chosen order.
    const merged = {
      filter,
      page: String(page),
      sort: sp.sort,
      dir: sp.dir,
      ...patch,
    };
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

      <FilterTabs
        tabs={FILTERS.map((f) => ({ ...f, count: counts[f.key] }))}
        current={filter}
        hrefFor={(key) => href({ filter: key, page: undefined })}
      />

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nothing here.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  {(
                    [
                      ["order", "Order"],
                      ["customer", "Customer"],
                      ["method", "Method"],
                      ["status", "Status"],
                    ] as const
                  ).map(([column, label]) => (
                    <SortableHeader
                      key={column}
                      basePath="/admin/payments"
                      column={column}
                      label={label}
                      currentSort={currentSort}
                      currentDir={currentDir}
                      params={sp}
                    />
                  ))}
                  {/* Not sortable — an opaque gateway reference groups nothing
                      a person is scanning for. See PAYMENT_SORTS. */}
                  <TableHead>Razorpay payment</TableHead>
                  <SortableHeader
                    basePath="/admin/payments"
                    column="refund"
                    label="Refund"
                    currentSort={currentSort}
                    currentDir={currentDir}
                    params={sp}
                  />
                  <SortableHeader
                    basePath="/admin/payments"
                    column="amount"
                    label="Amount"
                    currentSort={currentSort}
                    currentDir={currentDir}
                    params={sp}
                    className="text-right"
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
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
                    </TableCell>
                    <TableCell>
                      {row.user.name ?? "—"}
                      <span className="block text-xs text-muted-foreground">{row.user.email}</span>
                    </TableCell>
                    <TableCell className="uppercase">{row.paymentMethod}</TableCell>
                    <TableCell>
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${PAYMENT_TONE[row.paymentStatus] ?? "bg-muted"}`}
                      >
                        {row.paymentStatus}
                      </span>
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatINR(row.totalAmount.toString())}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AdminPagination
        page={page}
        totalPages={pages}
        total={total}
        label={total === 1 ? "order" : "orders"}
        hrefFor={(next) => href({ page: String(next) })}
      />
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
