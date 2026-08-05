import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireRole } from "@/server/auth/require-role";
import { getAdminOrder } from "@/server/orders/admin";
import { formatINR } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderStatusSelect, ShipOrderButton } from "@/components/admin/order-row-actions";
import { CopyButton } from "@/components/admin/copy-button";

export const metadata: Metadata = { title: "Order" };

type Params = Promise<{ id: string }>;

type ShippingAddress = {
  fullName?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
};

export default async function AdminOrderPage({ params }: { params: Params }) {
  await requireRole("admin");

  const { id } = await params;
  const order = await getAdminOrder(id);
  if (!order) notFound();

  const address = (order.shippingAddress ?? {}) as ShippingAddress;

  const addressLines = [
    address.fullName,
    address.addressLine1,
    address.addressLine2,
    [address.city, address.state].filter(Boolean).join(", "),
    address.pincode,
  ].filter(Boolean) as string[];

  // One block the admin can paste straight onto a shipping label.
  const addressForCopy = [...addressLines, address.phone ? `Phone: ${address.phone}` : ""]
    .filter(Boolean)
    .join("\n");

  const canShip =
    !order.shipmentCreatedAt &&
    ["placed", "confirmed", "processing"].includes(order.orderStatus) &&
    (order.paymentMethod === "cod" || order.paymentStatus === "paid");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/orders" className="text-sm text-muted-foreground underline">
          ← All orders
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{order.orderNumber}</h1>
          <Badge variant={order.paymentStatus === "failed" ? "destructive" : "outline"}>
            {order.paymentMethod === "cod" ? "COD" : order.paymentStatus}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {order.createdAt.toLocaleString("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {/* ── What to pack ────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Items to pack ({order.items.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {order.items.map((item) => (
                <div key={item.id} className="flex gap-4 border-b pb-4 last:border-0 last:pb-0">
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-muted">
                    {item.image && (
                      <Image src={item.image} alt={item.name} fill className="object-cover" sizes="64px" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.name}</p>
                    {/* The size is what fulfilment picks, so it is given the
                        same weight as the SKU rather than buried in the meta
                        line — a packer scanning this must not have to hunt. */}
                    {item.size && (
                      <p className="mt-0.5 text-sm font-semibold text-brass-text">
                        Size: {item.size}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      SKU: {item.product?.sku ?? "—"}
                      {item.weight ? ` · ${item.weight.toString()} g` : ""}
                    </p>
                    <p className="mt-1 text-sm">
                      Quantity: <span className="font-medium">{item.quantity}</span> ×{" "}
                      {formatINR(item.price.toString())}
                    </p>
                    {item.product?.slug && (
                      <Link
                        href={`/products/${item.product.slug}`}
                        target="_blank"
                        className="text-xs underline"
                      >
                        View on store
                      </Link>
                    )}
                  </div>
                  <p className="text-sm font-medium">
                    {formatINR((Number(item.price) * item.quantity).toString())}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* ── Where to send it ────────────────────────────────────────── */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Delivery address</CardTitle>
              <CopyButton value={addressForCopy} label="Copy address" />
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {addressLines.length === 0 ? (
                <p className="text-muted-foreground">No address recorded on this order.</p>
              ) : (
                addressLines.map((line, i) => (
                  <p key={i} className={i === 0 ? "font-medium" : "text-muted-foreground"}>
                    {line}
                  </p>
                ))
              )}
              {address.phone && (
                <p className="pt-2">
                  Phone:{" "}
                  <a href={`tel:${address.phone}`} className="underline">
                    {address.phone}
                  </a>
                </p>
              )}
            </CardContent>
          </Card>

          {order.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Customer note</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{order.notes}</CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {/* ── Who ordered ─────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium">{order.user.name ?? "—"}</p>
              <p>
                <a href={`mailto:${order.user.email}`} className="underline">
                  {order.user.email}
                </a>
              </p>
              {order.user.phone && <p className="text-muted-foreground">{order.user.phone}</p>}
              <p className="pt-2 text-xs text-muted-foreground">
                Customer since{" "}
                {order.user.createdAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}
              </p>
            </CardContent>
          </Card>

          {/* ── Money ───────────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Subtotal" value={formatINR(order.subtotal.toString())} />
              <Row
                label="Shipping"
                value={
                  Number(order.shippingCharge) === 0
                    ? "Free"
                    : formatINR(order.shippingCharge.toString())
                }
              />
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Total</span>
                <span>{formatINR(order.totalAmount.toString())}</span>
              </div>
              <Row
                label="Method"
                value={order.paymentMethod === "cod" ? "Cash on delivery" : "Razorpay"}
              />
              <Row label="Status" value={order.paymentStatus} />
              {order.razorpayPaymentId && (
                <Row label="Payment ID" value={order.razorpayPaymentId} mono />
              )}
              {order.refundStatus !== "idle" && (
                <Row label="Refund" value={order.refundStatus} />
              )}
            </CardContent>
          </Card>

          {/* ── Fulfilment ──────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fulfilment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Order status</p>
                <OrderStatusSelect orderId={order.id} status={order.orderStatus} />
              </div>

              {order.trackingNumber ? (
                <div>
                  <p className="text-xs text-muted-foreground">Tracking</p>
                  {order.trackingUrl ? (
                    <a
                      href={order.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {order.trackingNumber}
                    </a>
                  ) : (
                    <p>{order.trackingNumber}</p>
                  )}
                  {order.courierName && (
                    <p className="text-xs text-muted-foreground">{order.courierName}</p>
                  )}
                </div>
              ) : canShip ? (
                <ShipOrderButton orderId={order.id} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  {order.paymentStatus !== "paid" && order.paymentMethod !== "cod"
                    ? "Awaiting payment before this can be shipped."
                    : "Not ready to ship."}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs" : ""}>{value}</span>
    </div>
  );
}
