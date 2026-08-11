import { ViewTransition } from "react";
import { SiteHeader } from "@/components/storefront/site-header";
import { SiteFooter } from "@/components/storefront/site-footer";
import { UserStateHydrator } from "@/components/storefront/user-state-hydrator";
import { SiteJsonLd } from "@/components/storefront/structured-data";
import { SmoothScrollProvider } from "@/components/storefront/motion/smooth-scroll-provider";

/**
 * Only the <main> content slides during navigation. The announcement bar,
 * header and footer sit outside the ViewTransition so the page's frame stays
 * put — the header additionally pins itself via viewTransitionName.
 *
 * `default: "none"` on both enter and exit is what keeps untyped navigations
 * (initial load, browser back/forward, anything without transitionTypes) from
 * animating. Without it every transition on the page fires this one too.
 *
 * `storefront-shell` is not decoration: it is the scope for the
 * `:has([data-hero-full])` rule in globals.css that lifts the header out of the
 * flow and floats it over a full-bleed hero. The class has to sit on an element
 * that contains BOTH the header and the page content — this div is the only one
 * that does.
 */
export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="storefront-shell flex min-h-full flex-1 flex-col">
      {/* Renders nothing — fills the per-shopper wishlist/cart store once per
          session so listing pages don't have to be built per user. */}
      <UserStateHydrator />

      {/* Organization + WebSite, once for the whole storefront. Synchronous and
          built from environment values only, so it costs the layout nothing. */}
      <SiteJsonLd />

      {/* Renders nothing, and nothing below 1024px or under reduced motion.
          Unlike the version removed in ef2fe2d this needs no Suspense boundary:
          it reads no runtime data — no usePathname — so it does not make every
          storefront route blocking, and /blog/[slug] stays fully static. */}
      <SmoothScrollProvider />


      {/* ── Atmosphere ──────────────────────────────────────────────────────
          Two fixed layers carried over from the previous storefront. Both are
          pure CSS over the whole viewport, cost nothing to render and no
          JavaScript at all, and are what stops a flat ivory page reading like a
          template. Storefront only — the admin and CMS want a plain surface.

          BELOW the interactive layer, at z-30. These used to sit at z-105/110,
          above everything including dialogs, on the theory that grain stopping
          at the edge of a modal announces itself as an overlay. In practice the
          opposite was worse: a search overlay, a mega menu, a filter drawer and
          every Radix dialog were being painted through a vignette that darkens
          towards the edges, which made a white panel look grubby at its corners
          and dimmed the controls inside it.

          The stack is now: page content → grain/vignette (30) → sticky header
          (40) → Radix overlays (50+). pointer-events-none throughout, so
          nothing here can ever intercept a tap. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-30 opacity-[0.03] mix-blend-multiply"
        style={{
          // Inline SVG turbulence as a data URI: one repeating tile, no network
          // request, and the browser rasterises it once.
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      {/* Vignette, halved from 0.15 to 0.07. At full strength it read as a
          filter applied to a photograph rather than as atmosphere — the corners
          of a full-bleed hero were visibly darker than its centre. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-30 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.07)_100%)]"
      />
      {/* The announcement is no longer a sibling of the header — it is the
          header's first band, so the two scroll and stick as one object. See
          header/utility-bar.tsx. */}
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
