import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/server/auth/auth";
import { getUserOrder } from "@/server/orders/queries";
import { OrderDetail } from "@/components/storefront/orders/order-detail";
import { getReviewableItems } from "@/server/reviews/reviewable-items";
import { CancelOrderButton } from "@/components/storefront/orders/cancel-order-button";
import { ReturnOption } from "@/components/storefront/orders/return-option";
import { getStoreSettings } from "@/server/settings/store-settings";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PayNowNotice,
  PaymentExpiredNotice,
  SoldOutNotice,
} from "@/components/storefront/orders/pay-now-button";
import { closeIfSoldOut } from "@/server/orders/sold-out";
import { unpaidState } from "@/lib/order-payment";
import { prisma } from "@/server/db";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { hasInvoice } from "@/lib/invoice-links";

const CANCELLABLE = ["placed", "confirmed", "processing"] as const;

/**
 * ⚠️  The page body is deliberately EMPTY of data access.
 *
 * With `cacheComponents` on, an uncached read outside a `<Suspense>` boundary
 * is an error, not a preference: Next refuses to prerender a shell for the
 * route and the navigation becomes blocking. This page used to `await auth()`
 * on its first line, which meant nothing could be sent until the session, the
 * order and the reviewable items had all resolved — a measured 9.2s on a cold
 * request, with a blank screen for the whole of it.
 *
 * `auth()` reads cookies and the order is per-shopper, so neither `"use cache"`
 * nor `instant = false` is the right answer — the first is impossible and the
 * second only silences the warning while keeping the blocking behaviour.
 * Streaming is the fix: the shell paints immediately and the per-shopper part
 * arrives when it can.
 *
 * Same shape as the admin layout's AdminGate, and for the same reason.
 */
export default function AccountOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ placed?: string }>;
}) {
  return (
    <div className="container-checkout rhythm-transactional">
      <Suspense fallback={<OrderDetailSkeleton />}>
        <OrderDetailContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function OrderDetailContent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ placed?: string }>;
}) {
  const session = await auth();
  const { id } = await params;
  if (!session?.user?.id) redirect(`/login?redirect=/account/orders/${id}`);

  const [loaded, { placed }, reviewable, settings] = await Promise.all([
    getUserOrder(id, session.user),
    searchParams,
    // Empty unless this order is delivered — reviewing is gated on receipt.
    getReviewableItems(id, session.user),
    getStoreSettings(),
  ]);
  if (!loaded) {
    // Not this account's order. If it exists at all, it is on ANOTHER account —
    // typically a link from an email opened while signed in as someone else.
    // Say so and offer the switch, rather than a bare "not found". Never says
    // whose account it is on: the ids are unguessable, but the owner is still
    // nobody else's business.
    const exists = await prisma.order.findUnique({ where: { id }, select: { id: true } });
    if (!exists) notFound();
    return <OtherAccountNotice orderId={id} signedInAs={session.user.email ?? null} />;
  }

  // Unpaid and payable, but a piece has sold out since? Then the order is
  // cancelled here and shown as such — never a Pay now that could only end in
  // a charge and a refund. See server/orders/sold-out.ts.
  const soldOut = unpaidState(loaded) === "awaiting" ? await closeIfSoldOut(loaded) : [];
  const order = soldOut.length > 0 ? { ...loaded, orderStatus: "cancelled" as const } : loaded;

  const cancellable =
    (CANCELLABLE as readonly string[]).includes(order.orderStatus) &&
    !order.shipmentCreatedAt;

  // An online order the shopper never paid for — see lib/order-payment.ts.
  const unpaid = unpaidState(order);

  const invoiceAvailable = hasInvoice(order);

  return (
    <>
      {placed && (
        <p className="mb-6 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">
          Thank you! Your order has been placed successfully.
        </p>
      )}
      {soldOut.length > 0 && (
        <div className="mb-6">
          <SoldOutNotice names={soldOut} />
        </div>
      )}
      {unpaid === "awaiting" && (
        <div className="mb-6">
          <PayNowNotice orderId={order.id} successHref={`/account/orders/${order.id}?placed=1`} />
        </div>
      )}
      {unpaid === "expired" && (
        <div className="mb-6">
          <PaymentExpiredNotice />
        </div>
      )}
      <OrderDetail order={order} reviewable={reviewable} />
      {(cancellable || order.orderStatus === "delivered" || invoiceAvailable) && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {cancellable && (
            <CancelOrderButton orderId={order.id} wasPaid={order.paymentStatus === "paid"} />
          )}
          {order.orderStatus === "delivered" && (
            <ReturnOption
              order={order}
              hours={settings.returnRequestHours}
              whatsappNumber={settings.whatsappNumber}
            />
          )}
          {/* Same condition the invoice route enforces — offering a link that
              404s is worse than not offering one. */}
          {invoiceAvailable && (
            <Link href={`/account/orders/${order.id}/invoice`} className="text-sm underline">
              View tax invoice
            </Link>
          )}
        </div>
      )}
    </>
  );
}

/**
 * The order exists but belongs to a different account than the one signed in.
 * Signing out returns to the login page with this order as the destination,
 * so signing in with the right email lands straight on it.
 */
function OtherAccountNotice({ orderId, signedInAs }: { orderId: string; signedInAs: string | null }) {
  return (
    <div className="mx-auto max-w-lg rhythm-commerce text-center">
      <h1 className="text-h2">This order is on a different account</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {signedInAs ? (
          <>
            You&apos;re signed in as <strong className="text-foreground">{signedInAs}</strong>.{" "}
          </>
        ) : null}
        Sign out and sign in with the email you used to place this order, and it will open
        straight away.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <SignOutButton
          variant="default"
          label="Sign out and switch account"
          redirectTo={`/login?redirect=/account/orders/${orderId}`}
        />
        <Link
          href="/account/orders"
          className="inline-flex h-8 items-center rounded-md border px-3 text-sm"
        >
          See my orders
        </Link>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Placed it without an account? Use the link in your order email instead, or{" "}
        <Link href="/track-order" className="underline">
          track it here
        </Link>
        .
      </p>
    </div>
  );
}

/** Roughly the geometry of a resolved order, so nothing jumps when it lands. */
function OrderDetailSkeleton() {
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
