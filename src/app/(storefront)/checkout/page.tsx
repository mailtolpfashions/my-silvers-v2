import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/db";
import { getCartWithProducts } from "@/server/cart";
import { toPaise, type ShippingRates } from "@/server/orders/money";
import { getStoreSettings } from "@/server/settings/store-settings";
import { STICKY_BAR_SPACER } from "@/components/storefront/sticky-action-bar";
import {
  CheckoutForm,
  type CheckoutLine,
  type SavedAddress,
} from "@/components/storefront/checkout/checkout-form";

export default async function CheckoutPage() {
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
    // The spacer stops the sticky Pay bar covering the order summary.
    <div className={`container-checkout rhythm-transactional ${STICKY_BAR_SPACER}`}>
      <h1 className="mb-8 text-h1">Checkout</h1>
      <CheckoutForm
        isAuthed={isAuthed}
        userEmail={session?.user?.email ?? undefined}
        userName={session?.user?.name ?? undefined}
        initialLines={initialLines}
        savedAddresses={savedAddresses}
        rates={rates}
        codEnabled={settings.codEnabled}
      />
    </div>
  );
}
