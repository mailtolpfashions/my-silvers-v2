import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/db";
import { AddressBook } from "@/components/storefront/account/address-book";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Delivery addresses" };

/**
 * Chrome prerenders, the address book streams. Reading the session in the page
 * body makes the whole route uncached under cacheComponents, so the back link
 * and the heading wait on a database round trip for no reason.
 */
export default function AddressesPage() {
  return (
    <div className="container-checkout rhythm-transactional">
      <Link href="/account" className="text-sm text-muted-foreground underline">
        ← Back to account
      </Link>
      <h1 className="mb-6 mt-4 text-h1">Delivery addresses</h1>

      <Suspense fallback={<AddressesSkeleton />}>
        <Addresses />
      </Suspense>
    </div>
  );
}

async function Addresses() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?redirect=/account/addresses");

  const addresses = await prisma.address.findMany({
    where: { userId: session.user.id },
    orderBy: [{ isDefault: "desc" }, { id: "asc" }],
  });

  return (
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
  );
}

function AddressesSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 2 }, (_, i) => (
        <Skeleton key={i} className="h-32 w-full" />
      ))}
    </div>
  );
}
