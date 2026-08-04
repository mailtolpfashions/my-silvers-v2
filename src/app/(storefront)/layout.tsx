import { ViewTransition } from "react";
import { SiteHeader } from "@/components/storefront/site-header";
import { SiteFooter } from "@/components/storefront/site-footer";
import { AnnouncementBar } from "@/components/storefront/cms/announcement-bar";
import { UserStateHydrator } from "@/components/storefront/user-state-hydrator";

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
