import Link from "next/link";
import { ConfirmCodWhatsapp } from "@/components/admin/confirm-cod-whatsapp";
import { isCancellable } from "@/lib/order-cancel-reasons";
import { getAdminOrders } from "@/server/orders/admin";
import type { PaymentStatus } from "@/generated/prisma/client";
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
  OrderStatusSelect,
  CancelOrderButton,
  ShipOrderButton,
  ReturnReviewButtons,
  ReceivedBackButton,
} from "@/components/admin/order-row-actions";
import { isComingBack, UNPAID_ATTEMPTS_FILTER } from "@/lib/order-coming-back";
import { PdfExportButton } from "@/components/admin/pdf-export-button";
import { viewerIsOwner } from "@/components/admin/owner-only";
import { SortableHeader } from "@/components/admin/sortable-header";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { AdminOrderFilters } from "@/components/admin/order-filters";

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

type SearchParams = Promise<{
  status?: string;
  payment?: string;
  q?: string;
  page?: string;
  sort?: string;
  dir?: string;
}>;

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const isOwner = await viewerIsOwner();
  const { orders, total, page, pageSize, hiddenUnpaid } = await getAdminOrders({
    // A string, not just an OrderStatus — "coming_back" is a filter too.
    status: params.status,
    payment: params.payment as PaymentStatus | undefined,
    q: params.q,
    page: params.page ? Number(params.page) || 1 : 1,
    sort: params.sort,
    dir: params.dir,
  });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Mirrors the defaults in getAdminOrders so the arrow matches the real order.
  const currentSort = params.sort ?? "placed";
  const currentDir: "asc" | "desc" = params.dir === "asc" ? "asc" : "desc";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description="Every order, newest first — search, filter, and ship from here."
        // Exports hand over customers' personal details in bulk — owner only.
        actions={
          isOwner && (
          <>
            <Button asChild variant="outline" size="sm">
              <a href="/api/admin/export/orders">Export orders CSV</a>
            </Button>
            <PdfExportButton
              endpoint="/api/admin/export/orders"
              filename="orders.pdf"
              label="Orders PDF"
            />
            <Button asChild variant="outline" size="sm">
              <a href="/api/admin/export/customers">Export customers CSV</a>
            </Button>
          </>
          )
        }
      />

      <AdminOrderFilters
        current={{ status: params.status, payment: params.payment, q: params.q }}
      />

      <p className="text-sm text-muted-foreground">
        {total} orders
        {hiddenUnpaid > 0 && (
          <>
            {" "}
            · {hiddenUnpaid} unpaid online attempt{hiddenUnpaid === 1 ? "" : "s"} hidden —{" "}
            <Link href={`/admin/orders?status=${UNPAID_ATTEMPTS_FILTER}`} className="underline">
              show
            </Link>
          </>
        )}
      </p>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {(
                [
                  ["order", "Order"],
                  ["customer", "Customer"],
                  ["total", "Total"],
                  ["payment", "Payment"],
                  ["status", "Status"],
                ] as const
              ).map(([column, label]) => (
                <SortableHeader
                  key={column}
                  basePath="/admin/orders"
                  column={column}
                  label={label}
                  currentSort={currentSort}
                  currentDir={currentDir}
                  params={params}
                />
              ))}
              {/* Neither is a sortable value: tracking is a free-text courier
                  reference, and Actions holds buttons. */}
              <TableHead>Tracking</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => {
              const shippable =
                !order.shipmentCreatedAt &&
                ["placed", "confirmed", "processing"].includes(order.orderStatus) &&
                (order.paymentMethod === "cod" || order.paymentStatus === "paid");
              return (
                <TableRow key={order.id}>
                  <TableCell className="min-w-56 max-w-72">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="text-sm font-medium underline underline-offset-2"
                    >
                      {order.orderNumber}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {order.createdAt.toLocaleDateString("en-IN", { dateStyle: "medium" })} ·{" "}
                      {order.items.length} item{order.items.length === 1 ? "" : "s"}
                    </p>
                    {/* The product names are what an admin actually scans for — one
                        line, full list on hover. Two wrapped lines in a narrow
                        column doubled every row's height. */}
                    {(() => {
                      const items = order.items
                        .map((i) => `${i.quantity} × ${i.name}${i.size ? ` (${i.size})` : ""}`)
                        .join(", ");
                      return (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground" title={items}>
                          {items}
                        </p>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="max-w-56">
                    <p className="truncate text-sm">{order.user?.name ?? "—"}</p>
                    <p className="truncate text-xs text-muted-foreground" title={order.user?.email}>
                      {order.user?.email}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatINR(order.totalAmount.toString())}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={order.paymentStatus === "failed" ? "destructive" : "outline"}
                    >
                      {order.paymentMethod === "cod" ? "COD" : order.paymentStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <OrderStatusSelect orderId={order.id} status={order.orderStatus} paymentStatus={order.paymentStatus} />
                    {isComingBack(order) && (
                      <Badge variant="outline" className="mt-1 block w-fit border-amber-300 bg-amber-50 text-amber-900">
                        Coming back
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {order.trackingNumber ? (
                      order.trackingUrl ? (
                        <a
                          href={order.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          {order.trackingNumber}
                        </a>
                      ) : (
                        order.trackingNumber
                      )
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {shippable && (
                        <ShipOrderButton orderId={order.id} />
                      )}
                      {order.paymentMethod === "cod" && isCancellable(order) && (
                        <ConfirmCodWhatsapp
                          phone={(order.shippingAddress as { phone?: string } | null)?.phone}
                          fullName={(order.shippingAddress as { fullName?: string } | null)?.fullName}
                          orderNumber={order.orderNumber}
                          total={formatINR(order.totalAmount.toString())}
                        />
                      )}
                      {isCancellable(order) && (
                        <CancelOrderButton
                          orderId={order.id}
                          orderNumber={order.orderNumber}
                          paid={order.paymentStatus === "paid"}
                          total={formatINR(order.totalAmount.toString())}
                        />
                      )}
                      {order.orderStatus === "return_requested" && (
                        <ReturnReviewButtons
                          orderId={order.id}
                          reason={order.returnReason}
                          canRefund={order.paymentStatus === "paid"}
                        />
                      )}
                      {isComingBack(order) && (
                        <ReceivedBackButton orderId={order.id} orderNumber={order.orderNumber} />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {orders.length === 0 && (
              <TableRow className="hover:bg-transparent">
                {/* 5 sortable columns plus Tracking and Actions. */}
                <TableCell colSpan={7} className="p-0">
                  <EmptyState
                    title="No orders match"
                    description="Nothing here with the current filters. Orders appear the moment a customer checks out."
                    action={
                      <Button asChild variant="outline" size="sm">
                        <Link href="/admin/orders">Clear filters</Link>
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            )}
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
