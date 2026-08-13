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
      {/* ── Account: desktop only ────────────────────────────────────────────
          Below lg the drawer already carries a "Your account" row, and the
          hamburger that opens it sits four targets to the left of this one. Two
          routes to the same page inside one 375px band is not a convenience —
          it spends a tap target on something the shopper can already reach.

          It did once render at every width, and the header-account skeleton
          reserves space to match, so the two must move together or the header
          shifts on a phone as this island resolves. See
          header-account-skeleton.tsx.

          `inline-flex` rather than `block` on the lg side: Button's own display
          is inline-flex, and `lg:block` would break the glyph's centring. */}
      {session?.user ? (
        <Button asChild variant="ghost" size="icon" className="hidden size-10 rounded-none md:size-11 lg:inline-flex" aria-label="Your account">
          <Link href="/account">
            <User className="size-5" />
          </Link>
        </Button>
      ) : (
        <Button asChild variant="ghost" size="icon" className="hidden size-10 rounded-none md:size-11 lg:inline-flex" aria-label="Sign in">
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
