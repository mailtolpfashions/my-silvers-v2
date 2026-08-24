import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/server/auth/auth";
import { getCurrentRole } from "@/server/auth/require-role";
import { DashboardShell, type NavGroup } from "@/components/layout/dashboard-shell";
import { Skeleton } from "@/components/ui/skeleton";

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
    ],
  },
  {
    // The partners' books. Everything under /admin already requires the admin
    // role (see AdminGate below), so there is no extra gate on the group — but
    // the readers in server/admin/finance.ts re-check anyway, because these are
    // the most sensitive figures in the application and a page is not the only
    // way to reach them.
    label: "Books",
    items: [
      { href: "/admin/finance", label: "Finance", icon: "finance" },
      { href: "/admin/newsletter", label: "Newsletter", icon: "newsletter" },
    ],
  },
  {
    // Last, and on its own. These are switches that change how the shop
    // behaves — COD, guest checkout, shipping rates — not a place you visit
    // during the day's work, so it sits below the things you do.
    label: "Store",
    items: [{ href: "/admin/settings", label: "Settings", icon: "settings" }],
  },
];

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
  // Defense in depth — proxy.ts already gates /admin optimistically, this is
  // the authoritative server-side check.
  //
  // The role comes from getCurrentRole() rather than session.user.role: the
  // session's copy is written once at sign-in and never refreshed, so a
  // demoted admin would keep rendering this shell until their token expired.
  // See the note in require-role.ts.
  const [session, role] = await Promise.all([auth(), getCurrentRole()]);
  if (!session?.user || role !== "admin") {
    redirect("/login?redirect=/admin");
  }

  return (
    <DashboardShell
      title="Admin"
      groups={ADMIN_NAV}
      roleLabel="admin"
      user={{ name: session.user.name, email: session.user.email }}
      // Declared here because only a server component can. The account menu is
      // a client dropdown and receives this as a prop — see the note in
      // dashboard-user-menu.tsx for why it stays a POST.
      signOutAction={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    >
      {children}
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
