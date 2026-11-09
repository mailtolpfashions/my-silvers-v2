import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getPublicOrderByToken } from "@/server/orders/queries";
import { getClaimableAccountEmail } from "@/server/orders/guest-account";
import { prisma } from "@/server/db";
import { GuestOrderHelp } from "@/components/storefront/orders/guest-order-help";
import { OrderDetail } from "@/components/storefront/orders/order-detail";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Guest tokenized order view — the ?ot= confirmation token issued at guest
 * checkout is the sole credential. No session required.
 *
 * Both `params` and `searchParams` are runtime data, so reading them in the
 * page body would leave the route unable to prerender a shell and every visit
 * blocking. They are read in the child instead; the container prerenders.
 *
 * This page matters more than its traffic suggests: it is where a guest lands
 * immediately after paying, and the one page they are told to bookmark.
 */
export default function GuestOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ot?: string; placed?: string }>;
}) {
  return (
    <div className="container-checkout rhythm-transactional">
      <Suspense fallback={<GuestOrderSkeleton />}>
        <GuestOrder params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function GuestOrder({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ot?: string; placed?: string }>;
}) {
  const { id } = await params;
  const { ot, placed } = await searchParams;

  const order = ot ? await getPublicOrderByToken(id, ot) : null;
  if (!order || !ot) notFound();

  const [user, claimEmail] = await Promise.all([
    prisma.user.findUnique({ where: { id: order.userId }, select: { email: true } }),
    getClaimableAccountEmail(order.id, ot),
  ]);

  return (
    <>
      <GuestOrderHelp
        orderNumber={order.orderNumber}
        email={user?.email ?? ""}
        placed={!!placed}
        claim={claimEmail ? { orderId: order.id, token: ot, email: claimEmail } : null}
      />
      <OrderDetail order={order} />
    </>
  );
}

/** Roughly a resolved order, so nothing jumps when it lands. */
function GuestOrderSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full" />
      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
