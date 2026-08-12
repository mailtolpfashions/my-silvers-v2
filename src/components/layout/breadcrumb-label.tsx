"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type LabelContext = {
  /** What the last crumb should say, when a page has told us. */
  label: string | null;
  setLabel: (value: string | null) => void;
};

const Ctx = createContext<LabelContext | null>(null);

/**
 * Lets a page name its own last breadcrumb.
 *
 * ── The problem ─────────────────────────────────────────────────────────────
 * Breadcrumbs render in the SHELL, above `children`, and derive from the URL —
 * which on a detail route is an opaque id. So `/admin/products/cmg7x2…` read
 * "Admin › Products › Edit", and every product, order and entry in the system
 * had the same last crumb. The shell cannot fix this alone: it has no access to
 * the page's data, and the page renders after the breadcrumbs.
 *
 * ── Why a context rather than a prop ────────────────────────────────────────
 * A prop would have to travel from the page UP to the shell, which is not a
 * direction React passes things. Threading it through the layout instead would
 * mean the layout fetching each record itself — a second query for something
 * the page has already loaded.
 *
 * So the shell provides, the page publishes, and the crumb reads. The page
 * stays the only thing that knows what it is showing.
 */
export function BreadcrumbLabelProvider({ children }: { children: React.ReactNode }) {
  const [label, setLabel] = useState<string | null>(null);
  const value = useMemo(() => ({ label, setLabel }), [label]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBreadcrumbLabel() {
  return useContext(Ctx);
}

/**
 * Rendered by a detail page to name its last crumb. Renders nothing.
 *
 * Clears on unmount, so navigating from a product to a list does not leave the
 * old product's name in the trail — the effect's cleanup is what makes this
 * safe to drop into any page without a matching teardown at the other end.
 */
export function BreadcrumbLabel({ value }: { value: string }) {
  const ctx = useBreadcrumbLabel();
  const setLabel = ctx?.setLabel;

  useEffect(() => {
    if (!setLabel) return;
    setLabel(value);
    return () => setLabel(null);
  }, [setLabel, value]);

  return null;
}
