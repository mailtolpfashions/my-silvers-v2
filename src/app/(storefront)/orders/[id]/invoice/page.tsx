import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/server/db";
import { buildInvoice } from "@/server/orders/invoice";
import { InvoiceDocument } from "@/components/orders/invoice-document";
import { InvoiceActions } from "@/components/orders/invoice-actions";
import { Skeleton } from "@/components/ui/skeleton";
import { hasInvoice } from "@/lib/invoice-links";

/**
 * The tax invoice for a GUEST order — one placed without an account — opened
 * with the order's private ?ot= token, exactly like the guest order page.
 *
 * Added Nov 2026 with the "Download invoice" button in the order emails: an
 * account holder's invoice sits behind their sign-in, but a guest had no way
 * to reach theirs at all. The token is the only key: no token, a wrong token,
 * or the token of a different order all end in "not found", and the page is
 * never indexed.
 *
 * As on the account copy, rendering ISSUES the invoice number if none exists
 * yet, so the page is gated on the order being billable (see hasInvoice).
 */
export const metadata = { title: "Tax invoice", robots: { index: false, follow: false } };

export default function GuestInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ot?: string }>;
}) {
  return (
    <div className="container-checkout rhythm-transactional">
      <Suspense fallback={<InvoiceSkeleton />}>
        <GuestInvoice params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function GuestInvoice({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ot?: string }>;
}) {
  const { id } = await params;
  const { ot } = await searchParams;
  if (!ot) notFound();

  const order = await prisma.order.findFirst({
    where: { id, confirmationToken: ot },
    include: { items: true, user: true },
  });
  if (!order || !hasInvoice(order)) notFound();

  const invoice = await buildInvoice(order);

  return (
    <>
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link href={`/orders/${id}?ot=${encodeURIComponent(ot)}`} className="text-sm underline">
          ← Back to order
        </Link>
        <InvoiceActions orderNumber={order.orderNumber} />
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
