import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { DashboardShell } from "@/components/layout/dashboard-shell";

const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/customers", label: "Customers" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
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
