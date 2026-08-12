"use client";

import Link from "next/link";
import { ExternalLink, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Initials for the avatar, from a name or failing that an email. */
function initials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.split("@")[0] || "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : source.slice(0, 2)).toUpperCase();
}

/**
 * Who is signed in, and the way out.
 *
 * ⚠️  Before this there was NO sign-out anywhere in /admin or /cms. The only
 * way to end an admin session from inside the admin was to navigate to the
 * storefront and find the button there — on a shared or public machine that is
 * a security problem, not only an inconvenience.
 *
 * ── The sign-out is a server action passed in from the layout ───────────────
 * It stays a POST, which is the point: a GET-triggered sign-out can be fired by
 * any third-party page embedding `<img src="/api/auth/signout">`. This dropdown
 * is a client component and cannot declare a server action itself, so the
 * layout hands one down and this renders a form around it. See
 * components/auth/sign-out-button.tsx, which makes the same argument.
 */
export function DashboardUserMenu({
  name,
  email,
  roleLabel,
  signOutAction,
}: {
  name?: string | null;
  email?: string | null;
  roleLabel: string;
  signOutAction: () => Promise<void>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full p-0.5 pr-2 text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label="Account menu"
        >
          <span
            aria-hidden
            className="flex size-8 items-center justify-center rounded-full bg-foreground text-xs font-medium text-background"
          >
            {initials(name, email)}
          </span>
          <span className="hidden max-w-32 truncate sm:inline">{name ?? email ?? "Account"}</span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">{name ?? "Signed in"}</p>
          {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
          <p className="mt-1 text-xs capitalize text-muted-foreground">{roleLabel}</p>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/" className="cursor-pointer">
            <ExternalLink className="size-4" aria-hidden />
            View storefront
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* asChild so the menu item IS the submit button — a button nested
            inside a menu item would need two clicks to reach. */}
        <DropdownMenuItem asChild variant="destructive">
          <form action={signOutAction}>
            <button type="submit" className="flex w-full cursor-pointer items-center gap-2">
              <LogOut className="size-4" aria-hidden />
              Sign out
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
