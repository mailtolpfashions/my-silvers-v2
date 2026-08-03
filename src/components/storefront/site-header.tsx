import Link from "next/link";
import Image from "next/image";
import { Heart, User } from "lucide-react";
import { auth } from "@/server/auth/auth";
import { getCartItemCount } from "@/server/cart";
import { getActiveCategories } from "@/server/products/search";
import { Button } from "@/components/ui/button";
import { CartButton } from "@/components/storefront/cart-button";
import { SearchBox } from "@/components/storefront/search-box";

export async function SiteHeader() {
  const session = await auth();
  const role = session?.user?.role;
  const [cartCount, categories] = await Promise.all([
    session?.user?.id ? getCartItemCount(session.user.id) : Promise.resolve(0),
    // Categories come from the catalogue, managed in /admin/categories, so the
    // nav can't drift from what the shop actually sells.
    getActiveCategories(),
  ]);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* ── Row 1: logo · search · account actions ─────────────────────────── */}
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4 sm:px-6 lg:gap-8 lg:px-8">
        <Link href="/" aria-label="MY Silvers — home" className="shrink-0">
          <Image
            src="/logo.png"
            alt="MY Silvers"
            width={519}
            height={311}
            priority
            className="h-9 w-auto"
          />
        </Link>

        {/* Centred in the middle of the row with a fixed ceiling — stretching it
            edge to edge on a wide screen makes the header look unbalanced. */}
        <div className="hidden flex-1 justify-center md:flex">
          <SearchBox className="w-full max-w-[540px]" />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          {role === "admin" && (
            <Button asChild variant="ghost" size="sm" className="hidden lg:inline-flex">
              <Link href="/admin">Admin</Link>
            </Button>
          )}
          {(role === "admin" || role === "editor") && (
            <Button asChild variant="ghost" size="sm" className="hidden lg:inline-flex">
              <Link href="/cms">CMS</Link>
            </Button>
          )}

          {/* Order: account · wishlist · cart. */}
          {session?.user ? (
            <Button asChild variant="ghost" size="icon" aria-label="Your account">
              <Link href="/account">
                <User />
              </Link>
            </Button>
          ) : (
            <Button asChild variant="ghost" size="icon" aria-label="Sign in">
              <Link href="/login">
                <User />
              </Link>
            </Button>
          )}

          <Button asChild variant="ghost" size="icon" aria-label="Wishlist">
            <Link href="/wishlist">
              <Heart />
            </Link>
          </Button>

          <CartButton isAuthed={!!session?.user} initialCount={cartCount} />
        </div>
      </div>

      {/* Mobile search — full width on its own line. */}
      <div className="border-t px-4 py-2.5 md:hidden">
        <SearchBox />
      </div>

      {/* ── Row 2: category navigation ─────────────────────────────────────── */}
      <nav
        aria-label="Categories"
        className="border-t bg-background/60"
      >
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
          {/* Scrolls horizontally on small screens rather than wrapping to
              several lines and pushing the page content down. */}
          {/* justify-center on a scrolling row would clip the first items once
              they overflow, so it only applies from the width where they fit. */}
          <ul className="flex items-center gap-6 overflow-x-auto py-2.5 text-sm lg:justify-center [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <li className="shrink-0">
              <Link href="/products" className="font-medium hover:text-gold-text">
                All Jewellery
              </Link>
            </li>
            {categories.map((category) => (
              <li key={category.id} className="shrink-0">
                <Link
                  href={`/category/${category.slug}`}
                  className="text-muted-foreground transition-colors hover:text-gold-text"
                >
                  {category.name}
                </Link>
              </li>
            ))}
            <li className="shrink-0">
              <Link
                href="/collections"
                className="text-muted-foreground transition-colors hover:text-gold-text"
              >
                Collections
              </Link>
            </li>
            <li className="shrink-0">
              <Link
                href="/blog"
                className="text-muted-foreground transition-colors hover:text-gold-text"
              >
                Journal
              </Link>
            </li>
          </ul>
        </div>
      </nav>
    </header>
  );
}
