import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/server/auth/require-role";
import { prisma } from "@/server/db";
import { buildInvoice } from "@/server/orders/invoice";
import { InvoiceDocument } from "@/components/orders/invoice-document";
import { PrintButton } from "@/components/orders/print-button";

export const metadata = { title: "Tax invoice" };

/**
 * The seller's copy — the one that goes in the parcel.
 *
 * Same document and same gate as the customer's route, deliberately: two
 * renderings of a tax invoice that could differ is a problem waiting to
 * happen, so both call buildInvoice and render InvoiceDocument. Only the
 * chrome around it and the authorisation differ.
 */
export default async function AdminInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("admin");
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true, user: true },
  });
  if (!order) notFound();

  const billable =
    order.orderStatus !== "cancelled" &&
    (order.paymentStatus === "paid" || order.paymentMethod === "cod");
  if (!billable) notFound();

  const invoice = await buildInvoice(order);

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link href={`/admin/orders/${id}`} className="text-sm underline">
          ← Back to order
        </Link>
        <PrintButton label="Print invoice" />
      </div>
      <InvoiceDocument invoice={invoice} />
    </div>
  );
}
