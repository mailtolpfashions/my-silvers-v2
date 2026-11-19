import Link from "next/link";
import QRCode from "qrcode";
import { prisma } from "@/server/db";
import { requireRoleForPage } from "@/server/auth/require-role";
import { getSeller } from "@/server/orders/invoice";
import { TO_SHIP_WHERE } from "@/server/admin/dashboard";
import { formatINR } from "@/lib/format";
import { LabelPrintButton } from "@/components/admin/label-print-button";

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
 * On each label: TO (name, address, a large PIN, phone) · FROM (the registered
 * address — getSeller, the same source as the tax invoice) · the order number
 * with a QR code that opens the order here · a "COD — collect ₹" box only for
 * cash-on-delivery orders · "GIFT" for gift orders. Never a price otherwise:
 * a label is read by everyone the parcel passes.
 *
 * When a courier has been booked, ITS label (with the AWB barcode it scans)
 * is the one that matters; this page says so on that order's label.
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

export default async function LabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; toShip?: string; size?: string }>;
}) {
  await requireRoleForPage("admin");
  const sp = await searchParams;
  const size: "4x6" | "a4" = sp.size === "a4" ? "a4" : "4x6";
  const ids = (sp.ids ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, MAX_LABELS);

  const orders =
    sp.toShip === "1"
      ? await prisma.order.findMany({ where: TO_SHIP_WHERE, orderBy: { createdAt: "asc" }, take: MAX_LABELS })
      : ids.length > 0
        ? await prisma.order.findMany({ where: { id: { in: ids } }, orderBy: { createdAt: "asc" } })
        : [];

  const seller = getSeller();
  const base = (process.env.APP_BASE_URL || "https://www.mysilvers.in").replace(/\/$/, "");
  const labels = await Promise.all(
    orders.map(async (o) => ({
      order: o,
      address: (o.shippingAddress ?? {}) as ShippingAddress,
      qr: await QRCode.toString(`${base}/admin/orders/${o.id}`, { type: "svg", margin: 0, errorCorrectionLevel: "M" }),
    }))
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
        }
      `}</style>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
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
          {labels.length > 0 && <LabelPrintButton />}
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
                  : "mx-auto h-[150mm] w-[100mm] bg-white shadow-sm print:shadow-none [break-after:page] last:[break-after:auto]"
              }
            >
              {page.map(({ order, address, qr }) => (
                <article
                  key={order.id}
                  data-label={order.orderNumber}
                  className={`flex flex-col gap-[3mm] overflow-hidden p-[6mm] text-black ${size === "a4" ? "border border-dashed border-black/40" : "h-full"}`}
                >
                  <div className="flex items-start justify-between gap-[3mm]">
                    <div className="min-w-0">
                      <p className="text-[9pt] font-semibold uppercase tracking-wider">To</p>
                      <p className="text-[15pt] font-bold leading-tight">{address.fullName}</p>
                    </div>
                    {order.isGift && (
                      <span className="shrink-0 border-2 border-black px-[2mm] text-[10pt] font-bold">GIFT</span>
                    )}
                  </div>

                  <div className="text-[11.5pt] leading-snug">
                    <p>{address.addressLine1}</p>
                    {address.addressLine2 && <p>{address.addressLine2}</p>}
                    <p>
                      {address.city}, {address.state}
                    </p>
                    <p className="mt-[1.5mm] text-[20pt] font-bold tracking-wider" data-label-pin>
                      PIN {address.pincode}
                    </p>
                    {address.phone && <p className="text-[12pt] font-semibold">Phone: {address.phone}</p>}
                  </div>

                  {order.paymentMethod === "cod" && (
                    <p data-label-cod className="border-2 border-black py-[1.5mm] text-center text-[14pt] font-bold">
                      COD — Collect {formatINR(order.totalAmount.toString())}
                    </p>
                  )}

                  {order.shipmentCreatedAt && order.trackingNumber && (
                    <p className="text-[8.5pt] leading-tight">
                      Booked with {order.courierName ?? "the courier"} · AWB {order.trackingNumber}. Use the courier&apos;s own label — it carries the barcode they scan.
                    </p>
                  )}

                  <div className="mt-auto flex items-end justify-between gap-[3mm] border-t border-black/30 pt-[3mm]">
                    <div className="min-w-0 text-[8.5pt] leading-snug">
                      <p className="font-semibold uppercase tracking-wider">From</p>
                      <p className="font-semibold">{seller.legalName}</p>
                      <p className="whitespace-pre-line">{seller.address || "No. 75, Perumal Kovil Street, Chengam, Tiruvannamalai District, Tamil Nadu – 606701"}</p>
                      {seller.phone && <p>Phone: {seller.phone}</p>}
                    </div>
                    <div className="shrink-0 text-center">
                      {/* Generated here from the order's own URL — not user input. */}
                      <div className="size-[20mm]" aria-label={`QR code for order ${order.orderNumber}`} dangerouslySetInnerHTML={{ __html: qr }} />
                      <p className="mt-[1mm] text-[9pt] font-bold">{order.orderNumber}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
