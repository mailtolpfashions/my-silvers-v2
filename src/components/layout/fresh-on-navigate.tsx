"use client";

import { Fragment, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * Starts its children from a clean slate on every fresh visit.
 *
 * With `cacheComponents` on, Next keeps a page you leave alive but hidden
 * (React `<Activity>`) and shows that same instance when you come back — state
 * and all. That is right for most screens and wrong for "create" screens: the
 * CMS editor at /new remembers the id it created on its first save (it swaps
 * the URL with history.replaceState and keeps going), so the next "New entry"
 * click reopened the entry just made instead of a blank one.
 *
 * `bfcacheId` changes on push/replace navigations (a <Link> click) and stays
 * put on browser back/forward, so keying on it gives a blank form for "New
 * entry" while Back still restores a half-typed draft.
 * See node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md.
 */
export function FreshOnNavigate({ children }: { children: ReactNode }) {
  const { bfcacheId } = useRouter();
  return <Fragment key={bfcacheId}>{children}</Fragment>;
}
