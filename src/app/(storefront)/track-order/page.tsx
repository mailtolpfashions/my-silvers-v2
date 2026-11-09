import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { AuthShell, AuthFooterLink } from "@/components/auth/auth-shell";
import { TrackOrderForm } from "@/components/storefront/orders/track-order-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Track your order",
  description: "Check the status of your MY Silvers order with your order number.",
};

/**
 * Track order. Signed-in shoppers are sent straight to their order list, which
 * already shows every order with its tracking; everyone else gets a lookup by
 * order number + email or mobile (see server/orders/track.ts for why both).
 *
 * The session is read inside Suspense, so the heading prerenders and only the
 * part that depends on who is asking waits on the request.
 */
export default function TrackOrderPage() {
  return (
    <AuthShell
      eyebrow="Orders"
      title="Track your order"
      description="Enter your order number and the email or mobile number you used at checkout."
      footer={
        <AuthFooterLink
          prompt="Ordered with an account?"
          href="/login?redirect=/account/orders"
          label="Sign in"
        />
      }
    >
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <TrackOrder />
      </Suspense>
    </AuthShell>
  );
}

async function TrackOrder() {
  const session = await auth();
  if (session?.user?.id) redirect("/account/orders");

  return (
    <TrackOrderForm
      whatsappNumber={(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/[^\d]/g, "")}
      supportEmail={process.env.RESEND_REPLY_TO || "support@mysilvers.in"}
    />
  );
}
