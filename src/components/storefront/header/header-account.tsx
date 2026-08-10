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
        <Button asChild variant="ghost" size="sm" className="hidden h-9 rounded-none px-3 text-sm lg:inline-flex">
          <Link href="/admin">Admin</Link>
        </Button>
      )}
      {(role === "admin" || role === "editor") && (
        <Button asChild variant="ghost" size="sm" className="hidden h-9 rounded-none px-3 text-sm lg:inline-flex">
          <Link href="/cms">CMS</Link>
        </Button>
      )}

      {/* Order: account · wishlist · cart.
          Icon size goes on the icon, NOT as `[&_svg]:size-6` on the Button.
          Button's base rule is `svg:not([class*='size-'])` — specificity (0,2,1)
          against a plain `[&_svg]` at (0,1,1) — so a descendant override loses
          and the glyph silently stays 16px however large the button gets. The
          :not() is the escape hatch: give the svg its own size- class. */}
      {/* Shown at every width: hamburger · wordmark · search · account ·
          wishlist · cart. Six targets fit inside 375px once the icons are 40px
          and the wordmark is constrained — the reason this was briefly
          desktop-only was an unrelated bug where the mobile mark rendered at
          its intrinsic 192px and pushed the whole cluster off screen. The
          drawer keeps its own "Your account" row as the redundant route. */}
      {session?.user ? (
        <Button asChild variant="ghost" size="icon" className="size-10 rounded-none md:size-11" aria-label="Your account">
          <Link href="/account">
            <User className="size-5" />
          </Link>
        </Button>
      ) : (
        <Button asChild variant="ghost" size="icon" className="size-10 rounded-none md:size-11" aria-label="Sign in">
          <Link href="/login">
            <User className="size-5" />
          </Link>
        </Button>
      )}

      <Button asChild variant="ghost" size="icon" className="size-10 rounded-none md:size-11" aria-label="Wishlist">
        <Link href="/wishlist">
          <Heart className="size-5" />
        </Link>
      </Button>

      <CartButton isAuthed={!!session?.user} initialCount={cartCount} />
    </>
  );
}
