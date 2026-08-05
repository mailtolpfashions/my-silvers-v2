import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { SearchBox } from "@/components/storefront/search-box";
import { HeaderSearch } from "@/components/storefront/header/search-loader";
import { MobileSearch } from "@/components/storefront/header/mobile-search";
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
      {/* ── Row 1: menu · logo · search · account actions ────────────────────
          One flex row at every width, logo on the left. On a phone this is the
          whole header: search collapses into the icon cluster rather than
          taking a second full-width row, which is ~57px of every screen. */}
      <div className="container-page flex h-14 items-center gap-2 md:h-20 md:gap-3 lg:gap-8">
        {/* Behind its own boundary: the drawer needs the category list, and
            waiting on that would block the whole header shell from prerendering. */}
        <Suspense fallback={<MobileNavSkeleton />}>
          <MobileNavLoader />
        </Suspense>

        {/* Two assets, not one scaled asset.

            The full lockup is stacked — mark above wordmark — and 107px wide at
            h-16. With three icons on the right there is simply no room to centre
            that on a 365px screen, and shrinking it until it fits puts the
            "MY SILVERS" text back under 10px, which is the smudge we just fixed.
            So mobile gets the square mark alone and the lockup returns at md,
            where the row has the width for it. Same approach as the previous
            storefront. */}
        <Link href="/" aria-label="MY Silvers — home" className="shrink-0">
          <Image
            src="/android-chrome-192x192.png"
            alt="MY Silvers"
            width={192}
            height={192}
            preload
            className="h-9 w-9 object-contain md:hidden"
          />
          <Image
            src="/logo.png"
            alt="MY Silvers"
            width={519}
            height={311}
            preload
            className="hidden h-16 w-auto md:block"
          />
        </Link>

        {/* Centred in the middle of the row with a fixed ceiling — stretching it
            edge to edge on a wide screen makes the header look unbalanced. */}
        <div className="hidden flex-1 justify-center md:flex">
          {/* Fallback is the same box with its built-in default placeholder, so
              search is typeable before the CMS terms arrive. */}
          <Suspense fallback={<SearchBox className="w-full max-w-[640px]" />}>
            <HeaderSearch className="w-full max-w-[640px]" />
          </Suspense>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-2">
          {/* Opens the same SearchBox in a sheet. Rendered outside the account
              boundary so it never waits on the session. */}
          <MobileSearch>
            <Suspense fallback={<SearchBox />}>
              <HeaderSearch />
            </Suspense>
          </MobileSearch>

          <Suspense fallback={<HeaderAccountSkeleton />}>
            <HeaderAccount />
          </Suspense>
        </div>
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
  return <div className="size-10 shrink-0 md:size-12 lg:hidden" aria-hidden />;
}

/** Reserves the category row's exact height so the page below doesn't shift. */
function CategoryNavSkeleton() {
  // Height must match CategoryNavLinks exactly: py-3.5 (28px) + 24px line-box
  // + 1px border. A mismatch shifts the whole page as the nav streams in.
  return <div className="hidden h-[3.5625rem] border-t lg:block" aria-hidden />;
}
