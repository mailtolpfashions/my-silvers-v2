import Link from "next/link";
import QRCode from "qrcode";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/server/db";
import { requireRoleForPage } from "@/server/auth/require-role";
import { getSeller } from "@/server/orders/invoice";
import { TO_SHIP_WHERE } from "@/server/admin/dashboard";
import { courierSku } from "@/server/orders/admin";
import { code128Svg } from "@/server/barcode";
import { formatINR } from "@/lib/format";
import { courierLabel } from "@/lib/courier-text";
import { LabelPrintButton } from "@/components/admin/label-print-button";
import { MarkPackedButton } from "@/components/admin/mark-packed-button";
import { canMarkPacked } from "@/lib/order-status-labels";

/**
 * Address labels to paste on the courier cover (owner's request, Nov 2026).
 *
 *   /admin/orders/labels?ids=<id>,<id>   these orders
 *   /admin/orders/labels?toShip=1        every order waiting to be shipped
 *   &size=4x6 (default) | a4
 *
 * Two sheets, because the shop has both printers:
 *   4x6 — one label per page, 100 × 150 mm, the thermal label printers most
 *         Indian sellers use;
 *   a4  — four labels per A4 page with cut lines, for an ordinary printer.
 *
 * Laid out the way courier labels are (Delhivery / NimbusPost style), so a
 * delivery hub reads it at a glance: SHIP TO with a big PIN · PREPAID or
 * "COD — collect ₹" · the order number as a barcode · the courier and AWB
 * barcode once booked · what's inside (SKU, size, qty) · RETURN TO with the
 * GSTIN · a QR code that opens the order here.
 *
 * ⚠️  No item prices. The courier's own label carries the declared value; a
 * label on a parcel of silver is read by everyone it passes, so ours only
 * shows money when the courier must collect it (COD).
 */
export const metadata = { title: "Address labels", robots: { index: false, follow: false } };

type ShippingAddress = {
  fullName?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
};

const MAX_LABELS = 200;
/** Item rows that fit on a label; the rest are summarised. */
const MAX_ITEM_ROWS = 3;

function weightText(grams: number): string {
  if (grams <= 0) return "—";
  return grams >= 1000 ? `${(grams / 1000).toFixed(2)} kg` : `${Math.round(grams)} g`;
}

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/** An SVG drawn on the server from our own data (order number, AWB, URL) — never user input. */
function Svg({ svg, className, label }: { svg: string; className: string; label: string }) {
  return <div role="img" aria-label={label} className={className} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export default async function LabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; toShip?: string; size?: string }>;
}) {
  await requireRoleForPage("admin");
  const sp = await searchParams;
  const size: "4x6" | "a4" = sp.size === "a4" ? "a4" : "4x6";
  const ids = (sp.ids ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, MAX_LABELS);

  const include = { items: { include: { product: { select: { sku: true } } } } } as const;
  const orders =
    sp.toShip === "1"
      ? await prisma.order.findMany({ where: TO_SHIP_WHERE, include, orderBy: { createdAt: "asc" }, take: MAX_LABELS })
      : ids.length > 0
        ? await prisma.order.findMany({ where: { id: { in: ids } }, include, orderBy: { createdAt: "asc" } })
        : [];

  const toPackIds = orders.filter(canMarkPacked).map((o) => o.id);
  const seller = getSeller();
  const sellerAddress = seller.address || "No. 75, Perumal Kovil Street, Chengam, Tiruvannamalai District, Tamil Nadu – 606701";
  const base = (process.env.APP_BASE_URL || "https://www.mysilvers.in").replace(/\/$/, "");
  const labels = await Promise.all(
    orders.map(async (o) => {
      const booked = !!(o.shipmentCreatedAt && o.trackingNumber);
      return {
        order: o,
        address: (o.shippingAddress ?? {}) as ShippingAddress,
        qr: await QRCode.toString(`${base}/admin/orders/${o.id}`, { type: "svg", margin: 0, errorCorrectionLevel: "M" }),
        orderBarcode: code128Svg(o.orderNumber),
        awbBarcode: booked ? code128Svg(o.trackingNumber!) : null,
        booked,
        pieces: o.items.reduce((n, i) => n + i.quantity, 0),
        grams: o.items.reduce((g, i) => g + Number(i.weight ?? 0) * i.quantity, 0),
        items: o.items.map((i) => ({
          id: i.id,
          sku: courierSku(i.product?.sku, "", i.productId, i.id),
          name: i.name,
          size: i.size,
          qty: i.quantity,
        })),
      };
    })
  );

  const query = (next: "4x6" | "a4") => {
    const q = new URLSearchParams();
    if (sp.toShip === "1") q.set("toShip", "1");
    else if (ids.length) q.set("ids", ids.join(","));
    q.set("size", next);
    return `/admin/orders/labels?${q.toString()}`;
  };

  // A4 holds four 105 × 148.5 mm labels (2 × 2); 4x6 is one 100 × 150 mm label a page.
  const pages: (typeof labels)[] = [];
  const perPage = size === "a4" ? 4 : 1;
  for (let i = 0; i < labels.length; i += perPage) pages.push(labels.slice(i, i + perPage));

  return (
    <div>
      {/* @page can only be set globally, so it is written for the size chosen. */}
      <style>{`
        @media print {
          @page { size: ${size === "a4" ? "A4 portrait" : "100mm 150mm"}; margin: 0; }
          body:has([data-label-sheet]) *:not(:has([data-label-sheet])):not([data-label-sheet]):not([data-label-sheet] *) { display: none !important; }
          body:has([data-label-sheet]) *:has([data-label-sheet]) { margin: 0 !important; padding: 0 !important; border: 0 !important; background: none !important; min-height: 0 !important; }
          [data-label-sheet] * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="mb-6 print:hidden">
        <Link
          href="/admin/orders"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to orders
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-h2 font-semibold">Address labels</h1>
            <p className="text-sm text-muted-foreground">
              {labels.length === 0
                ? "No orders selected."
                : `${labels.length} label${labels.length === 1 ? "" : "s"} · ${size === "a4" ? "A4, 4 per page — cut along the dashed lines" : "4 × 6 in, one per page — for a label printer"}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border p-0.5 text-sm" role="tablist" aria-label="Label size">
              <Link role="tab" aria-selected={size === "4x6"} href={query("4x6")} className={`rounded px-3 py-1 ${size === "4x6" ? "bg-foreground text-background" : "text-muted-foreground"}`}>
                4 × 6 label
              </Link>
              <Link role="tab" aria-selected={size === "a4"} href={query("a4")} className={`rounded px-3 py-1 ${size === "a4" ? "bg-foreground text-background" : "text-muted-foreground"}`}>
                A4 sheet
              </Link>
            </div>
            {/* Optional, and separate from printing: a label is often printed
                BEFORE the piece is packed, so printing never marks anything. */}
            {toPackIds.length > 0 && (
              <MarkPackedButton
                orderIds={toPackIds}
                label={toPackIds.length === 1 ? "Mark as packed" : `Mark all ${toPackIds.length} as packed`}
              />
            )}
            {labels.length > 0 && <LabelPrintButton />}
          </div>
        </div>
      </div>

      {labels.length > 0 && (
        <div data-label-sheet className="space-y-6 print:space-y-0">
          {pages.map((page, p) => (
            <div
              key={p}
              className={
                size === "a4"
                  ? "mx-auto grid h-[297mm] w-[210mm] grid-cols-2 grid-rows-2 bg-white shadow-sm print:shadow-none [break-after:page] last:[break-after:auto]"
                  : "mx-auto h-[150mm] w-[100mm] bg-white p-[2.5mm] shadow-sm print:shadow-none [break-after:page] last:[break-after:auto]"
              }
            >
              {page.map((l) => {
                const { order, address } = l;
                const cod = order.paymentMethod === "cod";
                const shown = l.items.slice(0, MAX_ITEM_ROWS);
                const more = l.items.length - shown.length;
                return (
                  <div key={order.id} className={size === "a4" ? "border border-dashed border-black/40 p-[3mm]" : "h-full"}>
                    <article
                      data-label={order.orderNumber}
                      className="flex h-full flex-col overflow-hidden border-[0.5mm] border-black bg-white text-[8pt] leading-snug text-black"
                    >
                      {/* Brand bar */}
                      <header className="flex items-center justify-between bg-black px-[3mm] py-[1.5mm] text-white">
                        <span className="text-[11pt] font-bold tracking-[0.18em]">MY SILVERS</span>
                        <span className="text-[7.5pt] font-semibold uppercase tracking-wider">
                          {order.isGift ? "GIFT · " : ""}
                          {dateFmt.format(order.createdAt)}
                        </span>
                      </header>

                      {/* Ship to */}
                      <section className="px-[3mm] py-[2mm]">
                        <p className="text-[7pt] font-bold uppercase tracking-[0.15em]">Ship to</p>
                        <p className="text-[13pt] font-bold leading-tight">{address.fullName}</p>
                        <p className="mt-[0.5mm] text-[9pt]">
                          {address.addressLine1}
                          {address.addressLine2 ? `, ${address.addressLine2}` : ""}
                        </p>
                        <p className="text-[9pt]">
                          {address.city}, {address.state}
                        </p>
                        <div className="mt-[1.5mm] flex items-center justify-between gap-[2mm]">
                          <p data-label-pin className="bg-black px-[2mm] py-[0.5mm] text-[15pt] font-bold tracking-[0.12em] text-white">
                            PIN {address.pincode}
                          </p>
                          {address.phone && <p className="text-[10pt] font-bold">Ph: {address.phone}</p>}
                        </div>
                      </section>

                      {/* Payment · order */}
                      <section className="grid grid-cols-[38%_1fr] border-y-[0.5mm] border-black">
                        <div className="flex flex-col items-center justify-center border-r-[0.5mm] border-black p-[1.5mm] text-center">
                          {cod ? (
                            <div data-label-cod>
                              <p className="text-[17pt] font-black leading-none">COD</p>
                              <p className="mt-[1mm] text-[9pt] font-bold">Collect {formatINR(order.totalAmount.toString())}</p>
                            </div>
                          ) : (
                            <div>
                              <p className="text-[15pt] font-black leading-none">PREPAID</p>
                              <p className="mt-[1mm] text-[7pt] font-semibold">Do not collect cash</p>
                            </div>
                          )}
                        </div>
                        <div className="p-[1.5mm] text-center">
                          {l.orderBarcode && (
                            <Svg svg={l.orderBarcode} className="mx-auto h-[9mm] w-[42mm]" label={`Barcode for order ${order.orderNumber}`} />
                          )}
                          <p className="mt-[0.5mm] text-[9pt] font-bold tracking-wider">{order.orderNumber}</p>
                          <p className="text-[7pt]">
                            {l.pieces} piece{l.pieces === 1 ? "" : "s"} · {weightText(l.grams)}
                          </p>
                        </div>
                      </section>

                      {/* Courier — only once booked; its AWB is what the hub scans */}
                      {l.booked && (
                        <section className="border-b-[0.5mm] border-black px-[3mm] py-[1.5mm] text-center">
                          <p className="text-[9pt] font-bold uppercase tracking-[0.15em]">{order.courierName ? courierLabel(order.courierName) : "Courier"}</p>
                          {l.awbBarcode && (
                            <Svg svg={l.awbBarcode} className="mx-auto mt-[1mm] h-[12mm] w-[70mm]" label={`AWB barcode ${order.trackingNumber}`} />
                          )}
                          <p className="mt-[0.5mm] text-[9pt] font-bold tracking-wider">AWB {order.trackingNumber}</p>
                        </section>
                      )}

                      {/* Contents */}
                      <section className="px-[3mm] py-[1.5mm]">
                        <table className="w-full border-collapse text-[7.5pt]">
                          <thead>
                            <tr className="border-b border-black text-left text-[6.5pt] uppercase tracking-wider">
                              <th className="py-[0.5mm] pr-[1.5mm] font-bold">SKU</th>
                              <th className="py-[0.5mm] pr-[1.5mm] font-bold">Item</th>
                              <th className="py-[0.5mm] pr-[1.5mm] font-bold">Size</th>
                              <th className="py-[0.5mm] text-right font-bold">Qty</th>
                            </tr>
                          </thead>
                          <tbody>
                            {shown.map((i) => (
                              <tr key={i.id} className="border-b border-black/20 align-top">
                                <td className="max-w-[24mm] truncate py-[0.5mm] pr-[1.5mm] font-mono" data-label-sku>{i.sku}</td>
                                <td className="max-w-[40mm] truncate py-[0.5mm] pr-[1.5mm]">{i.name}</td>
                                <td className="py-[0.5mm] pr-[1.5mm]">{i.size || "—"}</td>
                                <td className="py-[0.5mm] text-right font-bold">{i.qty}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {more > 0 && <p className="mt-[0.5mm] text-[7pt] italic">+ {more} more item{more === 1 ? "" : "s"}</p>}
                      </section>

                      {/* Return to */}
                      <footer className="mt-auto flex items-end justify-between gap-[2mm] border-t-[0.5mm] border-black px-[3mm] py-[2mm]">
                        <div className="min-w-0 text-[7pt] leading-snug">
                          <p className="font-bold uppercase tracking-[0.15em]">If undelivered, return to</p>
                          <p className="text-[8pt] font-bold">{seller.legalName}</p>
                          <p className="whitespace-pre-line">{sellerAddress}</p>
                          {seller.phone && <p>Ph: {seller.phone}</p>}
                          {seller.gstin && <p>GSTIN: {seller.gstin}</p>}
                        </div>
                        <div className="shrink-0 text-center">
                          <Svg svg={l.qr} className="size-[16mm]" label={`QR code for order ${order.orderNumber}`} />
                          <p className="mt-[0.5mm] text-[6pt] uppercase tracking-wider">Scan for order</p>
                        </div>
                      </footer>
                    </article>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
