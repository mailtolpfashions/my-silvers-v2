"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MobileNavLink } from "@/components/storefront/header/mobile-nav";

/**
 * The desktop category row.
 *
 * A client component only because the active-link underline needs the current
 * pathname; the links themselves are resolved on the server and passed in, so
 * nothing about the catalogue is fetched here.
 */
export function CategoryNavLinks({ links }: { links: MobileNavLink[] }) {
  const pathname = usePathname();

  return (
    <ul className="flex items-center justify-center gap-7 py-3 text-sm">
      {links.map((link) => {
        // Exact match for the catalogue root, prefix match elsewhere, so
        // /category/rings marks Rings active without lighting up its siblings.
        const active =
          link.href === "/products" ? pathname === link.href : pathname.startsWith(link.href);

        return (
          <li key={link.href} className="shrink-0">
            <Link
              href={link.href}
              aria-current={active ? "page" : undefined}
              // The brass underline is the only active affordance — the row had
              // none at all before, so you couldn't tell where you were.
              className={`relative py-1 transition-colors after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-center after:bg-brass after:transition-transform ${
                active
                  ? "text-foreground after:scale-x-100"
                  : "text-muted-foreground after:scale-x-0 hover:text-foreground hover:after:scale-x-100"
              }`}
            >
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
