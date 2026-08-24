"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  FileText,
  HelpCircle,
  Home,
  Image as ImageIcon,
  LayoutDashboard,
  Layers,
  Megaphone,
  Newspaper,
  PiggyBank,
  Star,
  ShoppingCart,
  CreditCard,
  Mails,
  Package,
  Receipt,
  Settings,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Icons are chosen by KEY, not passed as components.
 *
 * The nav is built in a server layout and rendered by this client component,
 * and a React component cannot cross that boundary as a prop. A string does,
 * and it also keeps the icon set in one place rather than letting each layout
 * import its own.
 */
const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  products: Package,
  categories: Tags,
  orders: Receipt,
  customers: Users,
  finance: PiggyBank,
  reviews: Star,
  carts: ShoppingCart,
  payments: CreditCard,
  inventory: Boxes,
  newsletter: Mails,
  settings: Settings,
  media: ImageIcon,
  homepage: Home,
  page: FileText,
  blog: Newspaper,
  collection: Layers,
  announcement: Megaphone,
  // Keyed by the CONTENT TYPE'S NAME, not its `icon` field — the CMS layout
  // passes `icon: type.name`. See the note there.
  faq: HelpCircle,
  banner: ImageIcon,
  heroSlide: ImageIcon,
};

export type NavItem = {
  href: string;
  label: string;
  /** Key into ICONS. An unknown or missing key falls back to a generic mark. */
  icon?: string;
  /** Optional count shown on the right — unread orders, draft entries, etc. */
  badge?: number;
};

export type NavGroup = {
  /** Omitted for the first group, which needs no heading above it. */
  label?: string;
  items: NavItem[];
};

/**
 * The sidebar's link list, and the same list inside the mobile drawer.
 *
 * ── Active state is the whole reason this is a client component ──────────────
 * Before this, every link in the admin looked identical no matter which page
 * you were on — the sidebar told you what existed and nothing about where you
 * were. That is the single cheapest orientation cue a dashboard has.
 *
 * ── Matching, and the trap in it ────────────────────────────────────────────
 * `/admin` and `/cms` are prefixes of every page beneath them, so a plain
 * `startsWith` lights the Dashboard entry up on all of them. Exact match for
 * those two roots, prefix match for everything else — which is what makes
 * `/admin/products/new` correctly mark Products rather than Dashboard.
 */
export function DashboardNav({
  groups,
  onNavigate,
}: {
  groups: NavGroup[];
  /** Closes the drawer on mobile. Not passed by the persistent sidebar. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    const isRoot = href === "/admin" || href === "/cms";
    return isRoot ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav className="flex flex-col gap-6">
      {groups.map((group, i) => (
        <div key={group.label ?? i}>
          {group.label && (
            <p className="mb-2 px-3 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {group.label}
            </p>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = (item.icon && ICONS[item.icon]) || Boxes;
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    // aria-current is the non-visual half of the same signal —
                    // a screen reader announces "current page" rather than
                    // relying on the fill, which it cannot see.
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-foreground/90 font-medium text-background"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{item.label}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span
                        className={`ml-auto rounded-full px-1.5 py-0.5 text-[0.6875rem] font-medium tabular-nums ${
                          active ? "bg-background/20 text-background" : "bg-muted text-foreground"
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
