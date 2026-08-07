import { Suspense, ViewTransition } from "react";
import { SiteHeader } from "@/components/storefront/site-header";
import { SiteFooter } from "@/components/storefront/site-footer";
import { AnnouncementBar } from "@/components/storefront/cms/announcement-bar";
import { UserStateHydrator } from "@/components/storefront/user-state-hydrator";
import { SmoothScrollProvider } from "@/components/storefront/motion/smooth-scroll-provider";
import { ScrollRefresh } from "@/components/storefront/motion/scroll-refresh";
import { CursorLight } from "@/components/storefront/motion/cursor-light";

/**
 * Only the <main> content slides during navigation. The announcement bar,
 * header and footer sit outside the ViewTransition so the page's frame stays
 * put — the header additionally pins itself via viewTransitionName.
 *
 * `default: "none"` on both enter and exit is what keeps untyped navigations
 * (initial load, browser back/forward, anything without transitionTypes) from
 * animating. Without it every transition on the page fires this one too.
 */
export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* Renders nothing — fills the per-shopper wishlist/cart store once per
          session so listing pages don't have to be built per user. */}
      <UserStateHydrator />

      {/* Motion, all three rendering nothing. Smooth scrolling is desktop-only
          and the refresher exists because Cache Components streams sections in
          after the triggers were measured — see each file.

          SmoothScrollProvider is behind a boundary because it reads
          usePathname(), which is runtime data: without one, every storefront
          route — including /blog/[slug], which is otherwise fully static —
          becomes blocking. Same reason ProductFilters is wrapped on the
          listing pages. No fallback, because it renders nothing. */}
      <Suspense fallback={null}>
        <SmoothScrollProvider />
      </Suspense>
      <ScrollRefresh />
      <CursorLight />

      {/* ── Atmosphere ──────────────────────────────────────────────────────
          Two fixed layers carried over from the previous storefront. Both are
          pure CSS over the whole viewport, cost nothing to render and no
          JavaScript at all, and are what stops a flat ivory page reading like a
          template. Storefront only — the admin and CMS want a plain surface.

          Above everything (including dialogs) on purpose: grain that stops at
          the edge of a modal announces itself as an overlay. pointer-events-none
          throughout, so nothing here can ever intercept a tap. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[110] opacity-[0.03] mix-blend-multiply"
        style={{
          // Inline SVG turbulence as a data URI: one repeating tile, no network
          // request, and the browser rasterises it once.
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[105] bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.15)_100%)]"
      />
      <AnnouncementBar />
      <SiteHeader />
      <main className="flex-1">
        <ViewTransition
          enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
          exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
          default="none"
        >
          {children}
        </ViewTransition>
      </main>
      <SiteFooter />
    </div>
  );
}
