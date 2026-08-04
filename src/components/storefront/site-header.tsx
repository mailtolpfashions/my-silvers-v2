import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { SearchBox } from "@/components/storefront/search-box";
import { CategoryNav, buildNavLinks } from "@/components/storefront/header/category-nav";
import { MobileNav } from "@/components/storefront/header/mobile-nav";
import { HeaderAccount } from "@/components/storefront/header/header-account";
import { HeaderAccountSkeleton } from "@/components/storefront/header/header-account-skeleton";

/**
 * Synchronous on purpose. This component renders from (storefront)/layout.tsx,
 * so anything it awaits makes EVERY storefront route dynamic — which is what
 * used to happen, via auth(). The session now lives behind the Suspense
 * boundary below, and the catalogue read behind CategoryNav, so the header
 * shell itself can prerender.
 */
export function SiteHeader() {
  return (
    <header
      // Named so view transitions can hold it still while the page slides
      // underneath — see ::view-transition-group(site-header) in globals.css.
      // A header that moves with the content destroys the user's spatial
      // anchor and makes the direction cue unreadable.
      style={{ viewTransitionName: "site-header" }}
      className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
    >
      {/* ── Row 1: menu · logo · search · account actions ──────────────────── */}
      <div className="container-page flex h-16 items-center gap-3 lg:gap-8">
        {/* Behind its own boundary: the drawer needs the category list, and
            waiting on that would block the whole header shell from prerendering. */}
        <Suspense fallback={<MobileNavSkeleton />}>
          <MobileNavLoader />
        </Suspense>

        <Link href="/" aria-label="MY Silvers — home" className="shrink-0">
          <Image
            src="/logo.png"
            alt="MY Silvers"
            width={519}
            height={311}
            preload
            className="h-9 w-auto"
          />
        </Link>

        {/* Centred in the middle of the row with a fixed ceiling — stretching it
            edge to edge on a wide screen makes the header look unbalanced. */}
        <div className="hidden flex-1 justify-center md:flex">
          <SearchBox className="w-full max-w-[540px]" />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <Suspense fallback={<HeaderAccountSkeleton />}>
            <HeaderAccount />
          </Suspense>
        </div>
      </div>

      {/* Mobile search — full width on its own line. */}
      <div className="border-t px-4 py-2.5 md:hidden">
        <SearchBox />
      </div>

      {/* ── Row 2: category navigation (desktop only) ────────────────────────
          Behind a boundary because the active-link state reads usePathname(),
          which is runtime data on routes whose params aren't known at build —
          without this, /collections/[slug] and friends can't prerender a shell. */}
      <Suspense fallback={<CategoryNavSkeleton />}>
        <CategoryNav />
      </Suspense>
    </header>
  );
}

/** Resolves the shared nav links and hands them to the client drawer. */
async function MobileNavLoader() {
  const links = await buildNavLinks();
  return <MobileNav links={links} />;
}

/** Same footprint as the trigger button, so the header doesn't jump. */
function MobileNavSkeleton() {
  return <div className="size-9 shrink-0 lg:hidden" aria-hidden />;
}

/** Reserves the category row's exact height so the page below doesn't shift. */
function CategoryNavSkeleton() {
  return <div className="hidden h-[2.875rem] border-t lg:block" aria-hidden />;
}
