import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/db";
import { getCartWithProducts } from "@/server/cart";
import { toPaise, type ShippingRates } from "@/server/orders/money";
import { getStoreSettings } from "@/server/settings/store-settings";
import { isGeocodingConfigured } from "@/server/integrations/geocoding";
import { STICKY_BAR_SPACER } from "@/components/storefront/sticky-action-bar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckoutForm,
  type CheckoutLine,
  type SavedAddress,
} from "@/components/storefront/checkout/checkout-form";

/**
 * The heading prerenders; everything that depends on who is buying streams.
 *
 * This is the route where it matters most. Reading the session in the page body
 * made the whole of checkout uncached under cacheComponents, so a shopper who
 * had decided to buy saw nothing at all until the session, the store settings,
 * their cart and their saved addresses had every one come back. With functions
 * and the database in different regions that was seconds of blank screen at the
 * exact moment a shop can least afford one.
 */
export default function CheckoutPage() {
  return (
    // The spacer stops the sticky Pay bar covering the order summary.
    <div className={`container-checkout rhythm-transactional ${STICKY_BAR_SPACER}`}>
      <h1 className="mb-8 text-h1">Checkout</h1>
      <Suspense fallback={<CheckoutSkeleton />}>
        <CheckoutBody />
      </Suspense>
    </div>
  );
}

async function CheckoutBody() {
  const session = await auth();
  const isAuthed = !!session?.user?.id;
  const settings = await getStoreSettings();

  // Guest checkout switched off: send them to sign in rather than render a form
  // whose submit is guaranteed to be rejected. The CART is deliberately left
  // alone — a shopper should be asked to sign in when they try to buy, not when
  // they try to add.
  if (!isAuthed && !settings.guestCheckoutEnabled) {
    redirect("/login?redirect=/checkout");
  }

  const rates: ShippingRates = {
    shippingChargePaise: settings.shippingChargePaise,
    freeShippingThresholdPaise: settings.freeShippingThresholdPaise,
  };

  let initialLines: CheckoutLine[] | null = null;
  let savedAddresses: SavedAddress[] = [];

  if (isAuthed) {
    const [cart, addresses] = await Promise.all([
      getCartWithProducts(session!.user.id),
      prisma.address.findMany({
        where: { userId: session!.user.id },
        orderBy: [{ isDefault: "desc" }, { id: "asc" }],
      }),
    ]);

    initialLines = (cart?.items ?? [])
      .filter((i) => i.product.isActive)
      .map((i) => ({
        name: i.product.name,
        quantity: i.quantity,
        pricePaise: toPaise(i.product.price),
      }));

    savedAddresses = addresses.map((a) => ({
      id: a.id,
      label: a.label,
      fullName: a.fullName,
      phone: a.phone,
      addressLine1: a.addressLine1,
      addressLine2: a.addressLine2,
      city: a.city,
      state: a.state,
      pincode: a.pincode,
      isDefault: a.isDefault,
    }));
  }

  return (
    <CheckoutForm
      isAuthed={isAuthed}
      userEmail={session?.user?.email ?? undefined}
      userName={session?.user?.name ?? undefined}
      initialLines={initialLines}
      savedAddresses={savedAddresses}
      rates={rates}
      codEnabled={settings.codEnabled}
      geocodingEnabled={isGeocodingConfigured()}
    />
  );
}

/** The address form beside the order summary — checkout's two-column shape. */
function CheckoutSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
