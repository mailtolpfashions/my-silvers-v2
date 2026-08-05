"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { CmsIcon } from "@/components/storefront/cms/cms-icon";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export type MobileNavLink = {
  label: string;
  href: string;
  /** Lucide name or emoji, resolved by CmsIcon. Undefined = label only. */
  icon?: string | null;
};

/**
 * Mobile navigation drawer.
 *
 * Replaces the horizontally-scrolling category strip, which hid most of the
 * catalogue behind a swipe with no affordance that anything was off-screen.
 *
 * The links arrive as props from the cached server nav rather than being
 * fetched here, so opening the drawer costs no request and this component
 * carries no data-fetching weight into the client bundle.
 */
export function MobileNav({ links }: { links: MobileNavLink[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="size-10 md:size-12 lg:hidden" aria-label="Open menu">
          <Menu className="size-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[19rem] p-0">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="font-brand text-base font-light uppercase tracking-[0.2em]">
            MY <span className="text-brass-text">Silvers</span>
          </SheetTitle>
        </SheetHeader>

        <nav aria-label="Main" className="px-2 py-3">
          <ul>
            {links.map((link) => {
              // Exact match for the catalogue root, prefix match elsewhere, so
              // /category/rings marks Rings active without also lighting up
              // every sibling.
              const active =
                link.href === "/products"
                  ? pathname === link.href
                  : pathname.startsWith(link.href);

              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-base transition-colors ${
                      active
                        ? "bg-accent font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <CmsIcon name={link.icon ?? undefined} className="size-4 shrink-0 text-muted-foreground" />
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
