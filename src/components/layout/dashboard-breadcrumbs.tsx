"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { useBreadcrumbLabel } from "@/components/layout/breadcrumb-label";

/**
 * Static route segments — the ones this app defines in its own file tree and
 * which therefore cannot drift.
 *
 * ⚠️  CMS content types are NOT listed here. They used to be, and they drifted
 * immediately: this file said `blog: "Journal"` while the sidebar, which reads
 * ContentType.label from the database, said "Blog" — one screen calling the
 * same section two names. Type labels are editable data, so hardcoding them
 * guarantees a second divergence. They now arrive as the `labels` prop, from
 * the same query that builds the sidebar.
 */
const LABELS: Record<string, string> = {
  admin: "Admin",
  cms: "Studio",
  products: "Products",
  categories: "Categories",
  orders: "Orders",
  customers: "Customers",
  media: "Media",
  content: "Content",
  new: "New",
};

/**
 * An opaque record id — cuid, uuid, or any long token with no vowel pattern a
 * human would type. These become "Edit" rather than being printed raw.
 *
 * Deliberately loose. A breadcrumb reading `Products / cmg7x2k100001qz8v...`
 * is worse than no breadcrumb, and the cost of a false positive here is a
 * segment labelled "Edit" that could have said something better — which is
 * what the `trailing` prop is for when a page knows the real name.
 */
function isOpaqueId(segment: string) {
  return /^[a-z0-9]{12,}$/i.test(segment) || /^c[a-z0-9]{20,}$/i.test(segment);
}

/**
 * Where you are, derived from the URL.
 *
 * The admin had none of this: on `/admin/products/[id]` nothing on the page
 * said which list you had come from or offered a way back to it, so the browser
 * back button was the only route out.
 *
 * Derived rather than declared per page, because a trail that each page has to
 * remember to pass is a trail that half the pages will not have. Two things
 * the URL cannot supply are layered on top:
 *
 *   labels   CMS content-type names, from the database — see LABELS above
 *   the last crumb on a detail route, published by the page itself via
 *            <BreadcrumbLabel>, because an id is not a name
 */
export function DashboardBreadcrumbs({ labels }: { labels?: Record<string, string> }) {
  const pathname = usePathname();
  const ctx = useBreadcrumbLabel();
  const trailing = ctx?.label ?? undefined;
  const segments = pathname.split("/").filter(Boolean);

  // The root of each surface is already named by the sidebar; a single crumb
  // reading "Admin" on /admin says nothing.
  if (segments.length <= 1) return null;

  const crumbs = segments.map((segment, i) => ({
    href: `/${segments.slice(0, i + 1).join("/")}`,
    label: isOpaqueId(segment)
      ? "Edit"
      : (LABELS[segment] ??
        labels?.[segment] ??
        segment[0].toUpperCase() + segment.slice(1)),
    last: i === segments.length - 1,
  }));

  if (trailing && crumbs.length > 0) crumbs[crumbs.length - 1].label = trailing;

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1 text-sm">
        {crumbs.map((crumb) => (
          <li key={crumb.href} className="flex min-w-0 items-center gap-1">
            {crumb.last ? (
              // The current page is not a link — it would go nowhere.
              <span aria-current="page" className="truncate font-medium text-foreground">
                {crumb.label}
              </span>
            ) : (
              <>
                <Link
                  href={crumb.href}
                  className="truncate text-muted-foreground transition-colors hover:text-foreground"
                >
                  {crumb.label}
                </Link>
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
              </>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
