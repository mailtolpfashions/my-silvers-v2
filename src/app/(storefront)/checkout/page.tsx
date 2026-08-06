import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/db";
import { getCartWithProducts } from "@/server/cart";
import { toPaise } from "@/server/orders/money";
import { STICKY_BAR_SPACER } from "@/components/storefront/sticky-action-bar";
import {
  CheckoutForm,
  type CheckoutLine,
  type SavedAddress,
} from "@/components/storefront/checkout/checkout-form";

export default async function CheckoutPage() {
  const session = await auth();
  const isAuthed = !!session?.user?.id;

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
    <div className={`container-checkout py-10 ${STICKY_BAR_SPACER}`}>
      <h1 className="mb-8 text-2xl font-semibold">Checkout</h1>
      <CheckoutForm
        isAuthed={isAuthed}
        userEmail={session?.user?.email ?? undefined}
        userName={session?.user?.name ?? undefined}
        initialLines={initialLines}
        savedAddresses={savedAddresses}
      />
    </div>
  );
}
