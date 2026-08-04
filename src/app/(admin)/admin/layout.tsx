import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Skeleton } from "@/components/ui/skeleton";

const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/customers", label: "Customers" },
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
  const session = await auth();
  if (session?.user?.role !== "admin") {
    redirect("/login?redirect=/admin");
  }

  return (
    <DashboardShell title="Admin" navItems={ADMIN_NAV} roleLabel="Admin">
      {children}
    </DashboardShell>
  );
}

function AdminShellSkeleton() {
  return (
    <div className="flex min-h-screen">
      <Skeleton className="hidden w-60 shrink-0 md:block" />
      <div className="flex-1 space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}
