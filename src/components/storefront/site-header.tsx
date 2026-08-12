import { Suspense } from "react";
import Link from "next/link";
import { SearchBox } from "@/components/storefront/search-box";
import { HeaderSearch } from "@/components/storefront/header/search-loader";
import { SearchOverlay } from "@/components/storefront/header/search-overlay";
import { MegaMenu } from "@/components/storefront/header/mega-menu";
import { MobileNav } from "@/components/storefront/header/mobile-nav";
import { Wordmark } from "@/components/storefront/header/wordmark";
import { HeaderAccount } from "@/components/storefront/header/header-account";
import { HeaderAccountSkeleton } from "@/components/storefront/header/header-account-skeleton";
import { UtilityBar, UtilityBarSkeleton } from "@/components/storefront/header/utility-bar";
import { HeaderChrome } from "@/components/storefront/header/header-chrome";
import { buildNav, buildUtilityLinks } from "@/components/storefront/header/nav-model";

/**
 * The storefront header. Two bands, and that is the whole design.
 *
 * Band 1 (32px) — the CMS announcement and the service links.
 * Band 2 (48px mobile / 72px desktop) — menu, wordmark, five nav words, search,
 *   account, wishlist, cart.
 *
 * There is deliberately no third band. The category row that used to sit below
 * this cost 57px of every viewport and listed ten destinations at identical
 * weight, each with an icon beside it — which is the app convention, not the
 * retail one. Category depth now lives in the mega panels.
 *
 * ── Do not make this component async ─────────────────────────────────────────
 * It renders from (storefront)/layout.tsx, so anything awaited here makes EVERY
 * storefront route dynamic — which is what used to happen, via auth(). The
 * session lives behind the account boundary, the announcement behind the
 * utility boundary, and the catalogue reads behind the nav boundaries, so the
 * header shell itself can prerender. Keep it that way.
 *
 * ── Where the colours are ────────────────────────────────────────────────────
 * Nothing here paints a background. On a page that opens with a full-bleed hero
 * the whole header floats over the artwork in white, and returns to its solid
 * ivory self on hover, on focus, or as soon as the page scrolls. That is all
 * done by re-pointing semantic tokens in the `.site-header` block in
 * globals.css, so the children below stay ordinary `text-muted-foreground` /
 * `border-b` markup with no idea which state they are in. Adding a hardcoded
 * colour to anything in this subtree is what would break it.
 *
 * Still no backdrop blur, in either state. A translucent header over jewellery
 * photography smears the thing the page is selling; the transparent state uses
 * a top-down scrim for legibility instead, which costs nothing to composite.
 */
export function SiteHeader() {
  return (
    <HeaderChrome>
      <Suspense fallback={<UtilityBarSkeleton />}>
        <UtilityBar />
      </Suspense>

      <div className="border-b">
        <div className="container-page flex h-12 items-center gap-3 md:h-[72px] lg:gap-8">
          {/* Behind its own boundary: the drawer needs the nav model, and
              waiting on that would block the whole header shell from
              prerendering. */}
          <Suspense fallback={<MobileNavSkeleton />}>
            <MobileNavLoader />
          </Suspense>

          <Link href="/" aria-label="MY Silvers — home" className="shrink-0">
            <Wordmark className="h-7 md:h-12" />
          </Link>

          {/* The nav sits left, next to the wordmark, rather than centred.
              A centred nav has to be balanced against the icon cluster on the
              right, which means either padding the left or accepting that the
              whole row looks off — and it puts the first category further from
              the logo than from the cart. */}
          <Suspense fallback={<MegaMenuSkeleton />}>
            <MegaMenuLoader />
          </Suspense>

          {/* ── Search ────────────────────────────────────────────────────────
              Inline from lg, behind a glyph below it.

              This reinstates a visible field. The note that stood here argued
              search belongs behind an icon because a large centred box is the
              marketplace signal — Amazon, Flipkart, Myntra all lead with one —
              and that a curated brand puts navigation first. That reasoning is
              still on record in search-overlay.tsx and is worth reading before
              anyone changes this again; it was overruled deliberately, not
              forgotten.

              Two mitigations keep it from becoming that 640px pill: it is
              capped at 20rem and sits in the RIGHT cluster rather than centred,
              so the wordmark and the categories still lead the row.

              Only one of the two renders at any width — `hidden` removes the
              other from the accessibility tree entirely, so there is never a
              second combobox for a screen reader to find. */}
          <div className="ml-auto hidden w-full max-w-80 pl-6 lg:block">
            <Suspense fallback={<SearchBox variant="inline" />}>
              <HeaderSearch variant="inline" />
            </Suspense>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1 lg:ml-2">
            <div className="lg:hidden">
              <SearchOverlay>
                <Suspense fallback={<SearchBox />}>
                  <HeaderSearch />
                </Suspense>
              </SearchOverlay>
            </div>

            <Suspense fallback={<HeaderAccountSkeleton />}>
              <HeaderAccount />
            </Suspense>
          </div>
        </div>
      </div>
    </HeaderChrome>
  );
}

/** Resolves the shared nav model and hands it to the desktop panels. */
async function MegaMenuLoader() {
  const worlds = await buildNav();
  return <MegaMenu worlds={worlds} />;
}

/** Same model, plus the service links the mobile band has no room for. */
async function MobileNavLoader() {
  const [worlds, utilityLinks] = await Promise.all([buildNav(), buildUtilityLinks()]);
  return <MobileNav worlds={worlds} utilityLinks={utilityLinks} />;
}

/** Same footprint as the trigger button, so the header doesn't jump. */
function MobileNavSkeleton() {
  return <div className="size-10 shrink-0 lg:hidden" aria-hidden />;
}

/** Reserves the nav row's width so the icon cluster doesn't slide sideways. */
function MegaMenuSkeleton() {
  return <div className="hidden h-6 flex-1 lg:block" aria-hidden />;
}
