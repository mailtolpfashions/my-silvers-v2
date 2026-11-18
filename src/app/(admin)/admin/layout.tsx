import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/server/auth/auth";
import { getCurrentRole } from "@/server/auth/require-role";
import { isAdmin, isOwner } from "@/server/auth/roles";
import { DashboardShell, type NavGroup } from "@/components/layout/dashboard-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { OwnerProvider } from "@/components/admin/owner-context";
import { NewOrderWatcher } from "@/components/admin/dashboard/new-order-watcher";

/**
 * Grouped rather than one flat list: "Catalogue" is what you keep, "Commerce"
 * is what happens to it. Five links do not strictly need dividing, but the
 * grouping is what stops the list becoming an undifferentiated column the
 * moment a sixth and seventh arrive.
 */
const ADMIN_NAV: NavGroup[] = [
  { items: [{ href: "/admin", label: "Dashboard", icon: "dashboard" }] },
  {
    label: "Catalogue",
    items: [
      { href: "/admin/products", label: "Products", icon: "products" },
      { href: "/admin/categories", label: "Categories", icon: "categories" },
      { href: "/admin/inventory", label: "Inventory", icon: "inventory" },
    ],
  },
  {
    label: "Commerce",
    items: [
      { href: "/admin/orders", label: "Orders", icon: "orders" },
      { href: "/admin/customers", label: "Customers", icon: "customers" },
      { href: "/admin/reviews", label: "Reviews", icon: "reviews" },
      { href: "/admin/carts", label: "Abandoned carts", icon: "carts" },
      { href: "/admin/payments", label: "Payments", icon: "payments" },
      { href: "/admin/newsletter", label: "Newsletter", icon: "newsletter" },
    ],
  },
];

/**
 * The owner's own section, shown only to `superadmin`. Hiding the links is
 * presentation only — every page here re-checks with OwnerOnly and every
 * action and reader behind it with requireOwner(), because a link is not the
 * only way to reach a URL.
 *
 * Last, and on its own: these change who can do what and how the shop
 * behaves — money, switches, staff — not the day's work.
 */
const OWNER_NAV: NavGroup = {
  label: "Owner",
  items: [
    { href: "/admin/staff", label: "Staff & roles", icon: "staff" },
    { href: "/admin/activity", label: "Activity log", icon: "activity" },
    { href: "/admin/finance", label: "Finance", icon: "finance" },
    { href: "/admin/pricing", label: "Pricing", icon: "pricing" },
    { href: "/admin/coupons", label: "Coupons", icon: "coupons" },
    { href: "/admin/courier", label: "Courier", icon: "courier" },
    { href: "/admin/settings", label: "Settings", icon: "settings" },
    { href: "/admin/usage", label: "Usage & backups", icon: "usage" },
  ],
};

/**
 * The auth gate lives in a child behind Suspense rather than in the layout
 * body. Everything under /admin is per-user and uncacheable by nature; the
 * boundary is what declares that, so the rest of the app can still prerender.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AdminShellSkeleton />}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}

async function AdminGate({ children }: { children: React.ReactNode }) {
  /**
   * ⚠️  Declares this subtree request-time BEFORE auth() runs, and it has to be
   * before rather than anywhere in the function.
   *
   * The <Suspense> above was only half of what cacheComponents wants. The other
   * half is this: next-auth's `auth()` reads `new Date()` internally to check
   * session expiry, and the prerenderer refuses an unstable clock reading in a
   * scope that has not yet declared itself dynamic — "encountered the unstable
   * value `new Date()` while prerendering". `auth()` does read cookies, which
   * would make it dynamic, but the date is read first, so the complaint lands
   * before the cookie access can vouch for it.
   *
   * `connection()` is the documented [dynamic] remedy and it is also simply
   * true: nothing under /admin can be prerendered, because all of it depends on
   * who is asking. The Suspense boundary is what keeps that from leaking into
   * the rest of the app.
   *
   * See getDashboardTrends in server/admin/stats.ts for the same problem solved
   * the other way — a CACHED scope, where the clock has to come from
   * scheduleNow() instead. Which fix applies depends on whether the value may
   * differ per request. Here it must.
   */
  await connection();

  // Defense in depth — proxy.ts already gates /admin optimistically, this is
  // the authoritative server-side check.
  //
  // The role comes from getCurrentRole() rather than session.user.role: the
  // session's copy is written once at sign-in and never refreshed, so a
  // demoted admin would keep rendering this shell until their token expired.
  // See the note in require-role.ts.
  const [session, role] = await Promise.all([auth(), getCurrentRole()]);
  if (!session?.user || !isAdmin(role)) {
    redirect("/login?redirect=/admin");
  }

  return (
    <DashboardShell
      title="Admin"
      groups={isOwner(role) ? [...ADMIN_NAV, OWNER_NAV] : ADMIN_NAV}
      roleLabel={isOwner(role) ? "owner" : "admin"}
      user={{ name: session.user.name, email: session.user.email }}
      // Declared here because only a server component can. The account menu is
      // a client dropdown and receives this as a prop — see the note in
      // dashboard-user-menu.tsx for why it stays a POST.
      signOutAction={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    >
      <OwnerProvider isOwner={isOwner(role)}>{children}</OwnerProvider>
      {/* New-order alerts on every admin page — see new-order-watcher.tsx. */}
      <NewOrderWatcher />
    </DashboardShell>
  );
}

/** Matches the real shell's geometry, so nothing jumps when the gate resolves. */
function AdminShellSkeleton() {
  return (
    <div className="flex min-h-screen">
      <Skeleton className="hidden h-screen w-60 shrink-0 lg:block" />
      <div className="flex-1">
        <div className="flex h-14 items-center border-b px-4">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="space-y-4 p-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    </div>
  );
}
