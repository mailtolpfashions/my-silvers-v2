import Link from "next/link";
import { ShoppingBag, Heart } from "lucide-react";
import { auth } from "@/server/auth/auth";
import { Button } from "@/components/ui/button";

export async function SiteHeader() {
  const session = await auth();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          MY Silvers
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
          <Link href="/products" className="hover:text-foreground">
            Shop
          </Link>
          <Link href="/category/rings" className="hover:text-foreground">
            Rings
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="Wishlist">
            <Link href="/wishlist">
              <Heart />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon" aria-label="Cart">
            <Link href="/cart">
              <ShoppingBag />
            </Link>
          </Button>
          {session?.user?.role === "admin" && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin">Admin</Link>
            </Button>
          )}
          {session?.user &&
            (session.user.role === "admin" || session.user.role === "editor") && (
              <Button asChild variant="ghost" size="sm">
                <Link href="/cms">CMS</Link>
              </Button>
            )}
          {session?.user ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/account">Account</Link>
            </Button>
          ) : (
            <Button asChild size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
