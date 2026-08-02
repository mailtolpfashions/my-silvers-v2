import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export type NavItem = { href: string; label: string };

export function DashboardShell({
  title,
  navItems,
  roleLabel,
  children,
}: {
  title: string;
  navItems: NavItem[];
  roleLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1">
      <aside className="hidden w-56 shrink-0 border-r bg-muted/30 p-4 sm:block">
        <div className="mb-6 flex items-center justify-between">
          <span className="font-semibold">{title}</span>
          <Badge variant="secondary">{roleLabel}</Badge>
        </div>
        <nav className="space-y-1 text-sm">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 border-t pt-4">
          <Link href="/" className="block px-3 text-sm text-muted-foreground hover:text-foreground">
            ← Back to storefront
          </Link>
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
