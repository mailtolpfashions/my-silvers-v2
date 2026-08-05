import { notFound } from "next/navigation";
import { getPublicOrderByToken } from "@/server/orders/queries";
import { OrderDetail } from "@/components/storefront/orders/order-detail";

/**
 * Guest tokenized order view — the ?ot= confirmation token issued at guest
 * checkout is the sole credential. No session required.
 */
export default async function GuestOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ot?: string; placed?: string }>;
}) {
  const { id } = await params;
  const { ot, placed } = await searchParams;

  const order = ot ? await getPublicOrderByToken(id, ot) : null;
  if (!order) notFound();

  return (
    <div className="container-checkout py-10">
      {placed && (
        <p className="mb-6 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">
          Thank you! Your order has been placed successfully. Bookmark this page
          to check your order later — the link is unique to you.
        </p>
      )}
      <OrderDetail order={order} />
    </div>
  );
}
