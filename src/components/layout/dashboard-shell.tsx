import Link from "next/link";
import { Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DashboardNav, type NavGroup, type NavItem } from "@/components/layout/dashboard-nav";
import { DashboardMobileNav } from "@/components/layout/dashboard-mobile-nav";
import { DashboardBreadcrumbs } from "@/components/layout/dashboard-breadcrumbs";
import { DashboardUserMenu } from "@/components/layout/dashboard-user-menu";
import { BreadcrumbLabelProvider } from "@/components/layout/breadcrumb-label";

export type { NavItem, NavGroup };

/**
 * The frame every /admin and /cms page sits in.
 *
 * ── What this replaced ───────────────────────────────────────────────────────
 * A 56px sidebar of undifferentiated text links and nothing else. No indication
 * of the current page, no icons, no grouping, no breadcrumbs, no account menu,
 * no sign-out, and `hidden sm:block` — so below 640px there was no navigation
 * on screen at all. The pages underneath were already capable; the frame around
 * them was not.
 *
 * ── `.admin-surface` ────────────────────────────────────────────────────────
 * Opts this subtree into the admin's own visual language — status colour, a
 * denser rhythm — which is scoped in globals.css and deliberately kept off the
 * storefront. See the note there for why the two surfaces differ.
 *
 * ── Server component ────────────────────────────────────────────────────────
 * Only the four pieces that genuinely need the client are client components:
 * the nav (current path), the drawer (open state), the breadcrumbs (path) and
 * the account menu (a dropdown). The shell itself renders on the server, so
 * `signOutAction` can be created in the layout and handed down as a prop.
 */
export function DashboardShell({
  title,
  groups,
  roleLabel,
  user,
  signOutAction,
  breadcrumbLabels,
  children,
}: {
  /** "Admin" or "Studio" — which surface this is. */
  title: string;
  groups: NavGroup[];
  roleLabel: string;
  user: { name?: string | null; email?: string | null };
  signOutAction: () => Promise<void>;
  /**
   * URL segment → display name, for segments this app does not define
   * statically. The Studio passes its content types here, from the same query
   * that builds the sidebar, so the two can never disagree about what a type
   * is called.
   */
  breadcrumbLabels?: Record<string, string>;
  children: React.ReactNode;
}) {
  return (
    // The provider wraps BOTH the breadcrumbs and the page: a detail page
    // publishes its record's name into it and the trail reads it back.
    <BreadcrumbLabelProvider>
    <div className="admin-surface flex min-h-full flex-1 bg-muted/20">
      {/* ── Sidebar, lg and up ──────────────────────────────────────────────
          Sticky and its own scroll container: a long content-type list in the
          Studio must not push the storefront link off the bottom of a short
          window, and the nav should not scroll away with the page body. */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-background lg:flex">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-4">
          <Link href={title === "Studio" ? "/cms" : "/admin"} className="font-semibold">
            {title}
          </Link>
          <Badge variant="secondary" className="capitalize">
            {roleLabel}
          </Badge>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <DashboardNav groups={groups} />
        </div>

        <div className="border-t px-3 py-3">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Store className="size-4" aria-hidden />
            View storefront
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── Top bar ─────────────────────────────────────────────────────────
            Sticky, because the account menu and the way back up the hierarchy
            should not require scrolling to the top of a 200-row table. */}
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur-sm">
          <DashboardMobileNav title={title} groups={groups} />
          <DashboardBreadcrumbs labels={breadcrumbLabels} />
          <div className="ml-auto flex items-center gap-1">
            <DashboardUserMenu
              name={user.name}
              email={user.email}
              roleLabel={roleLabel}
              signOutAction={signOutAction}
            />
          </div>
        </header>

        {/* min-w-0 throughout the column: without it a wide table stretches the
            flex item instead of scrolling inside it, and the whole page gains a
            horizontal scrollbar. */}
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
    </BreadcrumbLabelProvider>
  );
}
