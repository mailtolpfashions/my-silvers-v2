import type { Metadata } from "next";
import Link from "next/link";
import { NotFoundContent } from "@/components/storefront/not-found-content";

export const metadata: Metadata = { title: "Page not found" };

/**
 * The last resort, outside any section's layout. Most wrong addresses never
 * get here — (storefront)/[...missing] catches them inside the shop's layout —
 * but anything that does still gets the shop's page, not Next.js's black
 * fallback. A wordmark stands in for the header it doesn't have.
 */
export default function RootNotFound() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="px-4 pt-8 text-center">
        <Link href="/" className="font-heading text-xl tracking-[0.2em]">
          MY SILVERS
        </Link>
      </div>
      <NotFoundContent />
    </main>
  );
}
