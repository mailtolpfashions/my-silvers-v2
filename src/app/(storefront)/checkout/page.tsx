import { auth } from "@/server/auth/auth";
import { getCartWithProducts } from "@/server/cart";
import { toPaise } from "@/server/orders/money";
import {
  CheckoutForm,
  type CheckoutLine,
} from "@/components/storefront/checkout/checkout-form";

export default async function CheckoutPage() {
  const session = await auth();
  const isAuthed = !!session?.user?.id;

  let initialLines: CheckoutLine[] | null = null;
  if (isAuthed) {
    const cart = await getCartWithProducts(session!.user.id);
    initialLines = (cart?.items ?? [])
      .filter((i) => i.product.isActive)
      .map((i) => ({
        name: i.product.name,
        quantity: i.quantity,
        pricePaise: toPaise(i.product.price),
      }));
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-8 text-2xl font-semibold">Checkout</h1>
      <CheckoutForm
        isAuthed={isAuthed}
        userEmail={session?.user?.email ?? undefined}
        userName={session?.user?.name ?? undefined}
        initialLines={initialLines}
      />
    </div>
  );
}
