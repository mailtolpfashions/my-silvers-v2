"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu, MessageCircle, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Wordmark } from "@/components/storefront/header/wordmark";
import { isActiveWorld } from "@/components/storefront/header/mega-menu";
import type { NavLink, NavWorld } from "@/components/storefront/header/nav-model";

/**
 * Digits only — wa.me rejects spaces, plus signs and dashes, and an editor
 * writing "+91 98765 43210" in .env is the likely case. Read as a literal
 * process.env.NEXT_PUBLIC_* expression because Next inlines these at build time
 * and cannot resolve a dynamic lookup. Blank hides the link entirely rather
 * than shipping a dead one.
 */
const WHATSAPP_NUMBER = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/[^\d]/g, "");

/**
 * The mobile drawer: the same five worlds as the desktop nav, as an accordion.
 *
 * It used to be a flat list of ten links, each with a Lucide icon beside it —
 * which is both the app convention rather than the retail one, and a structure
 * that said every destination was equally important. Expanding a world in place
 * keeps the shopper's position rather than pushing them through a second screen.
 *
 * The links arrive as props from the cached server nav, so opening the drawer
 * costs no request and this component carries no data-fetching weight into the
 * client bundle.
 */
export function MobileNav({
  worlds,
  utilityLinks,
}: {
  worlds: NavWorld[];
  utilityLinks: NavLink[];
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-10 rounded-none lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="size-6" />
        </Button>
      </SheetTrigger>

      <SheetContent side="left" className="flex w-[20rem] flex-col gap-0 p-0">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle asChild>
            <Link href="/" onClick={close} className="inline-block">
              <Wordmark className="h-9 w-auto" />
            </Link>
          </SheetTitle>
        </SheetHeader>

        <nav aria-label="Main" className="flex-1 overflow-y-auto">
          <ul>
            {worlds.map((world) => {
              // The same rule as the desktop nav, imported rather than
              // reimplemented — the two had already drifted once.
              const active = isActiveWorld(world, pathname, searchParams);
              const hasChildren = Boolean(world.columns?.length || world.tiles?.length);
              const isExpanded = expanded === world.label;

              return (
                <li key={world.label} className="border-b">
                  <div className="flex items-stretch">
                    {/* The label is always a real link to a real page, even for
                        a world that expands. Making the whole row a toggle is
                        what strands a shopper who wanted "Jewellery" itself. */}
                    <Link
                      href={world.href}
                      onClick={close}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-[3.25rem] flex-1 items-center px-5 text-base transition-colors ${
                        active ? "font-medium text-foreground" : "text-foreground"
                      }`}
                    >
                      {world.label}
                    </Link>

                    {hasChildren && (
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? "Collapse" : "Expand"} ${world.label}`}
                        onClick={() => setExpanded(isExpanded ? null : world.label)}
                        // 56px square: over the 44px touch-target floor, and
                        // wide enough that it never competes with the label.
                        className="flex w-14 shrink-0 items-center justify-center border-l text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {isExpanded ? (
                          <Minus className="size-4" />
                        ) : (
                          <Plus className="size-4" />
                        )}
                      </button>
                    )}
                  </div>

                  {hasChildren && isExpanded && (
                    <div className="bg-muted/40 px-5 pb-5 pt-1">
                      {world.columns?.map((column) => (
                        <div key={column.heading} className="mt-4 first:mt-2">
                          <p className="label-eyebrow mb-2.5">{column.heading}</p>
                          <ul className="flex flex-col">
                            {column.links.map((link) => (
                              <li key={link.href}>
                                <Link
                                  href={link.href}
                                  onClick={close}
                                  className="flex min-h-[2.75rem] items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
                                >
                                  {link.label}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}

                      {/* Collections have no columns when there are three or
                          fewer — their tiles carry the names, so list those. */}
                      {!world.columns?.length && world.tiles && (
                        <ul className="flex flex-col pt-2">
                          {world.tiles.map((tile) => (
                            <li key={tile.href}>
                              <Link
                                href={tile.href}
                                onClick={close}
                                className="flex min-h-[2.75rem] items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
                              >
                                {tile.title}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {/* The utility links that live in the desktop top band, plus the
              account — the header drops its account icon below md (five targets
              is the limit at 375px), so this is the route to it on a phone. */}
          {utilityLinks.length > 0 && (
            <ul className="px-5 py-4">
              <li>
                <Link
                  href="/account"
                  onClick={close}
                  className="flex min-h-[2.75rem] items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Your account
                </Link>
              </li>
              {utilityLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={close}
                    className="flex min-h-[2.75rem] items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </nav>

        {WHATSAPP_NUMBER && (
          // Pinned to the bottom. A shopper who opens the menu without finding
          // what they wanted is exactly who needs a way to ask, and on a phone
          // WhatsApp is the one they will actually use.
          <div className="border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <a
              href={`https://wa.me/${WHATSAPP_NUMBER}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={close}
              className="flex items-center gap-3 px-1 py-2 text-base text-muted-foreground transition-colors hover:text-foreground"
            >
              <MessageCircle className="size-4 shrink-0 text-black" />
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
