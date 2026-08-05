import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/db";
import { AddressBook } from "@/components/storefront/account/address-book";

export const metadata = { title: "Delivery addresses" };

export default async function AddressesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?redirect=/account/addresses");

  const addresses = await prisma.address.findMany({
    where: { userId: session.user.id },
    orderBy: [{ isDefault: "desc" }, { id: "asc" }],
  });

  return (
    <div className="container-checkout py-10">
      <Link href="/account" className="text-sm text-muted-foreground underline">
        ← Back to account
      </Link>
      <h1 className="mb-6 mt-4 text-2xl font-semibold">Delivery addresses</h1>

      <AddressBook
        addresses={addresses.map((a) => ({
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
        }))}
      />
    </div>
  );
}
