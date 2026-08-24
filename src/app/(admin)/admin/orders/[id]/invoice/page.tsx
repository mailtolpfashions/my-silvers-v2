import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/server/auth/require-role";
import { prisma } from "@/server/db";
import { buildInvoice } from "@/server/orders/invoice";
import { InvoiceDocument } from "@/components/orders/invoice-document";
import { PrintButton } from "@/components/orders/print-button";

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
