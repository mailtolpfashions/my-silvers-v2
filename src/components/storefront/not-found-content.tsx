import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getContactSettings } from "@/server/settings/store-settings";
import { whatsappLink } from "@/lib/whatsapp";

/**
 * The shop's own "page not found", for every wrong address on the site.
 *
 * It replaced Next.js's built-in fallback — a black screen with near-invisible
 * grey text and nowhere to go, which is what a mistyped link or an old product
 * link shared on WhatsApp used to land on. A dead end costs the visit; this
 * hands them search and the two most useful ways back in.
 *
 * Product, collection and blog pages keep their own wording (a retired piece
 * is a different story from a mistyped address). Used by both
 * app/(storefront)/not-found.tsx and the root app/not-found.tsx.
 */
export async function NotFoundContent() {
  const { whatsappNumber } = await getContactSettings();

  return (
    <div className="mx-auto max-w-lg px-4 rhythm-commerce text-center">
      <p className="label-eyebrow text-muted-foreground">Page not found</p>
      <h1 className="text-h2 mt-2">We couldn&apos;t find that page</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        The link may be old or mistyped. Let&apos;s get you back to the silver.
      </p>

      {/* A plain GET form to the shop's own search — works without JavaScript. */}
      <form action="/products" method="get" className="relative mx-auto mt-8 max-w-sm" role="search">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          name="q"
          type="search"
          placeholder="Search rings, anklets, pendants…"
          aria-label="Search the shop"
          className="h-11 w-full rounded-full border border-input bg-background pl-9 pr-4 text-sm outline-none focus-visible:border-ring"
        />
      </form>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/products">Shop all jewellery</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/collections">View collections</Link>
        </Button>
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        Looking for an order?{" "}
        <Link href="/track-order" className="underline">
          Track it here
        </Link>
        {whatsappNumber && (
          <>
            {" "}or{" "}
            <a
              href={whatsappLink(whatsappNumber, "Hi, I was looking for something on your website.")}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              ask us on WhatsApp
            </a>
          </>
        )}
        .
      </p>
    </div>
  );
}
