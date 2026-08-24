import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/db";
import { buildInvoice } from "@/server/orders/invoice";
import { InvoiceDocument } from "@/components/orders/invoice-document";
import { PrintButton } from "@/components/orders/print-button";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Tax invoice" };

/**
 * The customer's own copy of the tax invoice.
 *
 * Rendering this ISSUES the invoice number if one has not been issued yet, so
 * the route is gated on the order actually being billable. A tax invoice for a
 * cancelled order, or for an online order that was never paid, is a document
 * that should not exist — and issuing its number would burn a slot in a series
 * that has to stay explainable.
 *
 * Everything below the container is behind a boundary: the back link needs the
 * order id and the document needs the session, so there is no useful chrome to
 * paint ahead of them. What the boundary buys is that the route can prerender
 * its shell at all, rather than being blocking — see the note on
 * /account/orders/[id].
 */
export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="container-checkout rhythm-transactional">
      <Suspense fallback={<InvoiceSkeleton />}>
        <Invoice params={params} />
      </Suspense>
    </div>
  );
}

async function Invoice({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  if (!session?.user?.id) redirect(`/login?redirect=/account/orders/${id}/invoice`);

  const order = await prisma.order.findFirst({
    where: { id, userId: session.user.id },
    include: { items: true, user: true },
  });
  if (!order) notFound();

  const billable =
    order.orderStatus !== "cancelled" &&
    (order.paymentStatus === "paid" || order.paymentMethod === "cod");
  if (!billable) notFound();

  const invoice = await buildInvoice(order);

  return (
    <>
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link href={`/account/orders/${id}`} className="text-sm underline">
          ← Back to order
        </Link>
        <PrintButton />
      </div>
      <InvoiceDocument invoice={invoice} />
    </>
  );
}

function InvoiceSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-24" />
      </div>
      <Skeleton className="h-[32rem] w-full" />
    </div>
  );
}
