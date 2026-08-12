"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import type { NavWorld } from "@/components/storefront/header/nav-model";

/**
 * The desktop navigation: five words, three of which open a panel.
 *
 * A client component only because a panel has to open and close; the worlds
 * themselves are resolved on the server and passed in, so nothing about the
 * catalogue is fetched here and the header shell can still prerender.
 *
 * ── Accessibility ────────────────────────────────────────────────────────────
 * The pattern is a disclosure, not a menubar. Each top-level entry is a real
 * link to a real page — `Jewellery` goes to /products whether or not you ever
 * see the panel — with an adjacent button that toggles the panel. That split
 * matters: a link that also traps Enter to open a submenu is the single most
 * common broken mega-menu, because keyboard users can never reach the
 * destination the label promises.
 *
 * - Hover opens after a short delay; leaving closes after a longer one, so
 *   crossing a gap between the label and the panel doesn't dismiss it.
 * - Focus anywhere inside the nav keeps the panel open; focus leaving the whole
 *   nav closes it. Tab therefore walks label → toggle → into the panel.
 * - Escape closes and returns focus to the toggle.
 * - Pointer users who never touch the keyboard see none of this.
 */
export function MegaMenu({ worlds }: { worlds: NavWorld[] }) {
  const navRef = useRef<HTMLElement | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();

  /**
   * The open panel is stored WITH the path it was opened on, and the open state
   * is then derived during render rather than reset from an effect.
   *
   * A navigation must never leave a panel hanging over the new page. Doing that
   * with `useEffect(() => setOpenLabel(null), [pathname])` works but calls
   * setState synchronously inside an effect, which schedules a second render
   * pass on every navigation — and the project's lint rules reject it, rightly.
   * Deriving it costs nothing and cannot get out of step.
   */
  const [openPanel, setOpenPanel] = useState<{ label: string; path: string } | null>(null);
  const openLabel = openPanel?.path === pathname ? openPanel.label : null;

  const clearTimers = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const open = (label: string) => setOpenPanel({ label, path: pathname });
  const close = () => setOpenPanel(null);

  const scheduleOpen = (label: string) => {
    clearTimers();
    openTimer.current = setTimeout(() => open(label), 90);
  };

  const scheduleClose = () => {
    clearTimers();
    closeTimer.current = setTimeout(close, 180);
  };

  return (
    <nav
      ref={navRef}
      aria-label="Main"
      className="hidden lg:block"
      onMouseLeave={scheduleClose}
      // Focus moving anywhere outside the nav closes the panel. relatedTarget
      // is where focus is GOING; null means it left the document entirely
      // (alt-tab), which should not slam the panel shut under the user.
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && !navRef.current?.contains(next)) close();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !openLabel) return;
        event.stopPropagation();
        close();
      }}
    >
      <ul className="flex items-center gap-7">
        {worlds.map((world) => (
          <NavItem
            key={world.label}
            world={world}
            isOpen={openLabel === world.label}
            onOpen={() => scheduleOpen(world.label)}
            onToggle={() => (openLabel === world.label ? close() : open(world.label))}
            onCancelClose={clearTimers}
          />
        ))}
      </ul>
    </nav>
  );
}

/**
 * Which nav word is highlighted.
 *
 * Deliberately not a plain prefix match on the path. "Gifting" points at
 * `/products?q=gifting` and "Jewellery" at `/products`, so stripping the query
 * makes both of them `/products` — and BOTH lit up on the catalogue, which
 * tells a shopper nothing and looks broken. A world whose href carries a query
 * is therefore active only when that query is actually applied.
 *
 * Exported so the mobile drawer uses the same rule rather than its own copy.
 */
export function isActiveWorld(
  world: Pick<NavWorld, "href" | "activePaths">,
  pathname: string,
  search: URLSearchParams
): boolean {
  const [path, query] = world.href.split("?");

  if (query) {
    // Cheap and sufficient: these hrefs carry exactly one param.
    const [key, value] = query.split("=");
    return pathname === path && search.get(key) === value;
  }

  // Paths the world owns but does not point at — /category/* under Jewellery.
  if (world.activePaths?.some((prefix) => pathname.startsWith(prefix))) return true;

  // A world with no query must not claim a filtered listing either — otherwise
  // "Jewellery" stays lit while the shopper is browsing "Gifting".
  if (path === "/products") return pathname === path && !search.get("q");

  // `/blog` and `/collections` both have children, so those prefix-match.
  return pathname.startsWith(path);
}

function NavItem({
  world,
  isOpen,
  onOpen,
  onToggle,
  onCancelClose,
}: {
  world: NavWorld;
  isOpen: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onCancelClose: () => void;
}) {
  const pathname = usePathname();
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const hasPanel = Boolean(world.columns?.length || world.tiles?.length);

  const searchParams = useSearchParams();
  const active = isActiveWorld(world, pathname, searchParams);

  return (
    <li
      className="static"
      onMouseEnter={hasPanel ? onOpen : undefined}
      onFocus={hasPanel ? onCancelClose : undefined}
    >
      <span className="flex items-center">
        <Link
          href={world.href}
          aria-current={active ? "page" : undefined}
          className={`relative py-1 text-sm transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-px after:origin-center after:bg-black after:transition-transform ${
            active || isOpen
              ? "text-foreground after:scale-x-100"
              : "text-muted-foreground after:scale-x-0 hover:text-foreground hover:after:scale-x-100"
          }`}
        >
          {world.label}
        </Link>

        {/* The toggle is a separate control so the label above stays a plain
            link. Visually it is a 12px hit strip beside the word rather than a
            chevron — a caret next to every nav item is app furniture, and the
            panel opens on hover for pointer users anyway. */}
        {hasPanel && (
          <button
            ref={toggleRef}
            type="button"
            aria-expanded={isOpen}
            aria-controls={panelId}
            aria-label={`${world.label} menu`}
            onClick={onToggle}
            onKeyDown={(event) => {
              if (event.key === "Escape" && isOpen) toggleRef.current?.focus();
            }}
            className="ml-1 h-6 w-3 shrink-0 cursor-pointer"
          >
            <span
              aria-hidden
              className={`mx-auto block size-1 rounded-full transition-colors ${
                isOpen ? "bg-black" : "bg-transparent"
              }`}
            />
          </button>
        )}
      </span>

      {hasPanel && (
        <div
          id={panelId}
          // Not unmounted when closed: `hidden` keeps the markup in the DOM so
          // the links are crawlable and the panel does not have to be rebuilt
          // on every hover. inert stops closed panels taking focus.
          hidden={!isOpen}
          inert={!isOpen}
          className="absolute inset-x-0 top-full z-40 border-t bg-background"
        >
          {/* The one place the page's no-max-width rule is deliberately not
              followed. `.container-page` tracks the viewport so that the WIDEST
              screens get the widest photography — right for a catalogue of
              tiles, wrong for a menu, where it strands the link columns against
              the far left edge with a third of the panel empty between them and
              the tiles.

              Capped at --container-page, the token the rest of the page still
              measures against even though it is no longer applied as a ceiling
              there (see the .container-page block in globals.css). At 1920 that
              puts the first column at x=304; the reference this was matched to
              sits at 305. Below 1440 the cap never binds, so nothing changes at
              the width the design was drawn at. */}
          <div className="container-page grid max-w-[var(--container-page)] gap-10 py-10 lg:grid-cols-[1fr_auto] lg:gap-16">
            {world.columns && world.columns.length > 0 && (
              <div
                className="grid gap-x-12 gap-y-8"
                style={{
                  gridTemplateColumns: `repeat(${Math.min(world.columns.length, 3)}, minmax(0, 1fr))`,
                }}
              >
                {world.columns.map((column) => (
                  <div key={column.heading}>
                    <p className="label-eyebrow mb-4">{column.heading}</p>
                    <ul className="flex flex-col gap-2.5">
                      {column.links.map((link) => (
                        <li key={link.href}>
                          <Link
                            href={link.href}
                            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {link.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {world.tiles && world.tiles.length > 0 && (
              <div
                className="grid gap-4"
                style={{
                  gridTemplateColumns: `repeat(${Math.min(world.tiles.length, 3)}, minmax(0, 1fr))`,
                }}
              >
                {world.tiles.map((tile) => (
                  <Link key={tile.href} href={tile.href} className="group/tile block w-[15rem]">
                    <div className="relative aspect-[4/5] overflow-hidden bg-muted">
                      {tile.image && (
                        <Image
                          src={tile.image}
                          alt=""
                          fill
                          sizes="240px"
                          className="object-cover transition-transform duration-700 ease-out group-hover/tile:scale-[1.02]"
                        />
                      )}
                    </div>
                    <p className="mt-3 text-sm font-medium">{tile.title}</p>
                    <span className="mt-1 inline-flex items-center gap-1.5 border-b border-foreground pb-0.5 text-xs text-muted-foreground transition-colors group-hover/tile:border-black group-hover/tile:text-black">
                      {tile.linkLabel}
                      <ArrowRight aria-hidden className="size-3" />
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
