import Link from "next/link";
import { Heart, User } from "lucide-react";
import { auth } from "@/server/auth/auth";
import { getCartItemCount } from "@/server/cart";
import { Button } from "@/components/ui/button";
import { CartButton } from "@/components/storefront/cart-button";

/**
 * Everything in the header that depends on who is asking.
 *
 * This is deliberately the ONLY part of the header that reads the session.
 * It used to live in SiteHeader, which made the whole (storefront) route group
 * dynamic — including pages with no user-specific content at all. Keep the
 * auth() call inside this boundary.
 */
export async function HeaderAccount() {
  const session = await auth();
  const role = session?.user?.role;
  const cartCount = session?.user?.id ? await getCartItemCount(session.user.id) : 0;

  return (
    <>
      {role === "admin" && (
        <Button asChild variant="ghost" size="sm" className="hidden text-sm lg:inline-flex">
          <Link href="/admin">Admin</Link>
        </Button>
      )}
      {(role === "admin" || role === "editor") && (
        <Button asChild variant="ghost" size="sm" className="hidden text-sm lg:inline-flex">
          <Link href="/cms">CMS</Link>
        </Button>
      )}

      {/* Order: account · wishlist · cart. */}
      {session?.user ? (
        <Button asChild variant="ghost" size="icon" className="size-10 [&_svg]:size-5" aria-label="Your account">
          <Link href="/account">
            <User />
          </Link>
        </Button>
      ) : (
        <Button asChild variant="ghost" size="icon" className="size-10 [&_svg]:size-5" aria-label="Sign in">
          <Link href="/login">
            <User />
          </Link>
        </Button>
      )}

      <Button asChild variant="ghost" size="icon" className="size-10 [&_svg]:size-5" aria-label="Wishlist">
        <Link href="/wishlist">
          <Heart />
        </Link>
      </Button>

      <CartButton isAuthed={!!session?.user} initialCount={cartCount} />
    </>
  );
}
