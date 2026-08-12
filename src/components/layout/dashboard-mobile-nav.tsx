"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Store } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DashboardNav, type NavGroup } from "@/components/layout/dashboard-nav";

/**
 * The same navigation, in a drawer, below lg.
 *
 * ⚠️  The sidebar this sits beside is `hidden lg:flex`, and before this there
 * was no mobile equivalent at all — below 640px the admin had NO navigation on
 * screen. Every page was reachable only by typing its URL. Deleting this
 * without replacing it puts that back.
 *
 * Closes on navigation: a drawer left open over the page you just asked for is
 * the most common way this pattern is got wrong.
 */
export function DashboardMobileNav({
  title,
  groups,
}: {
  title: string;
  groups: NavGroup[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Open navigation"
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </SheetTrigger>

      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="text-left text-base">{title}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <DashboardNav groups={groups} onNavigate={() => setOpen(false)} />
        </div>

        <div className="border-t px-3 py-3">
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Store className="size-4" aria-hidden />
            View storefront
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
