"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, MessageCircle } from "lucide-react";
import { CmsIcon } from "@/components/storefront/cms/cms-icon";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * Digits only — wa.me rejects spaces, plus signs and dashes, and an editor
 * writing "+91 98765 43210" in .env is the likely case. Read as a literal
 * process.env.NEXT_PUBLIC_* expression because Next inlines these at build time
 * and cannot resolve a dynamic lookup. Blank hides the link entirely rather
 * than shipping a dead one.
 */
const WHATSAPP_NUMBER = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/[^\d]/g, "");

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
      <SheetContent side="left" className="flex w-[19rem] flex-col p-0">
        <SheetHeader className="border-b px-5 py-4">
          {/* The real lockup rather than a typeset imitation of it. The drawer
              opens over a light panel, so the dark-on-transparent logo works
              here — unlike the footer, which is why that one is still set in
              Raleway. sr-only text keeps the sheet's accessible name. */}
          <SheetTitle asChild>
            <Link href="/" onClick={() => setOpen(false)} className="inline-block">
              <Image
                src="/logo.png"
                alt="MY Silvers"
                width={519}
                height={311}
                className="h-11 w-auto"
              />
            </Link>
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

        {WHATSAPP_NUMBER && (
          // Pinned to the bottom of the drawer. A shopper who opens the menu
          // without finding what they wanted is exactly who needs a way to ask,
          // and on a phone WhatsApp is the one they will actually use.
          <div className="mt-auto border-t p-4">
            <a
              href={`https://wa.me/${WHATSAPP_NUMBER}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-base text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <MessageCircle className="size-4 shrink-0 text-brass-text" />
              <span>
                Get help
                <span className="block text-xs text-muted-foreground">
                  Chat with us on WhatsApp
                </span>
              </span>
            </a>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
