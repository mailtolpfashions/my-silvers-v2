import Link from "next/link";
import { getAdminOrders } from "@/server/orders/admin";
import type { OrderStatus, PaymentStatus } from "@/generated/prisma/client";
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
  ShipOrderButton,
  ReturnReviewButtons,
} from "@/components/admin/order-row-actions";
import { PdfExportButton } from "@/components/admin/pdf-export-button";
import { SortableHeader } from "@/components/admin/sortable-header";
import { AdminOrderFilters } from "@/components/admin/order-filters";

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
  const { orders, total, page, pageSize } = await getAdminOrders({
    status: params.status as OrderStatus | undefined,
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Orders</h1>
        <div className="flex gap-2">
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
        </div>
      </div>

      <AdminOrderFilters
        current={{ status: params.status, payment: params.payment, q: params.q }}
      />

      <p className="text-sm text-muted-foreground">{total} orders</p>

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
                  <TableCell>
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
                    {/* The product names are what an admin actually scans for. */}
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {order.items
                        .map((i) => `${i.quantity} × ${i.name}${i.size ? ` (${i.size})` : ""}`)
                        .join(", ")}
                    </p>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">{order.user.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{order.user.email}</p>
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
                    <OrderStatusSelect orderId={order.id} status={order.orderStatus} />
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
                      {shippable && <ShipOrderButton orderId={order.id} />}
                      {order.orderStatus === "return_requested" && (
                        <ReturnReviewButtons
                          orderId={order.id}
                          reason={order.returnReason}
                          canRefund={order.paymentStatus === "paid"}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
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
