import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { SignOutButton } from "@/components/auth/sign-out-button";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?redirect=/account");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">My account</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Signed in as {session.user.email} ({session.user.role})
      </p>
      <div className="mt-6 space-y-2">
        <Link href="/account/profile" className="block text-sm underline">
          Your details
        </Link>
        <Link href="/account/addresses" className="block text-sm underline">
          Delivery addresses
        </Link>
        <Link href="/account/orders" className="block text-sm underline">
          View your orders
        </Link>
        <Link href="/wishlist" className="block text-sm underline">
          Your wishlist
        </Link>
      </div>
      <div className="mt-8 border-t pt-6">
        <SignOutButton />
      </div>
    </div>
  );
}
