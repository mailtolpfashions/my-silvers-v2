"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";

type BulkContext = {
  selected: Set<string>;
  toggle: (id: string) => void;
  setMany: (ids: string[], on: boolean) => void;
  clear: () => void;
};

const Ctx = createContext<BulkContext | null>(null);

/**
 * Row selection for a SERVER-rendered table.
 *
 * ── The problem this shape solves ───────────────────────────────────────────
 * The admin tables are server components: the rows are rendered on the server
 * from a database query, which is what keeps them fast and lets them stream.
 * Selection is client state. Lifting the whole table to the client to get a
 * checkbox would give up the streaming and pull the entire product list into
 * the bundle.
 *
 * So the provider wraps the table, and only the checkboxes and the action bar
 * are clients inside it. The rows stay on the server; a server component can be
 * a child of a client provider, it just cannot be imported by one.
 *
 * ── Selection is per page, deliberately ─────────────────────────────────────
 * It clears on navigation because the component unmounts. That is the honest
 * behaviour for a paginated table: "select all" here means the 20 rows you can
 * see, and a selection that silently persisted across pages would make the
 * count in the action bar mean something the shopper cannot verify.
 */
export function BulkSelectProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setMany = useCallback((ids: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const value = useMemo(
    () => ({ selected, toggle, setMany, clear }),
    [selected, toggle, setMany, clear]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBulkSelect() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBulkSelect must be used inside a BulkSelectProvider");
  return ctx;
}

/** One row's checkbox. */
export function BulkRowCheckbox({ id, label }: { id: string; label: string }) {
  const { selected, toggle } = useBulkSelect();
  return (
    <Checkbox
      checked={selected.has(id)}
      onCheckedChange={() => toggle(id)}
      aria-label={`Select ${label}`}
    />
  );
}

/**
 * The header checkbox. Three states, and the third one matters: with some but
 * not all rows selected it shows indeterminate, so it reads as "partially
 * selected" rather than as "nothing selected" — which is what decides whether
 * clicking it selects everything or clears everything.
 */
export function BulkSelectAll({ ids }: { ids: string[] }) {
  const { selected, setMany } = useBulkSelect();
  const onPage = ids.filter((id) => selected.has(id)).length;
  const state = onPage === 0 ? false : onPage === ids.length ? true : "indeterminate";

  return (
    <Checkbox
      checked={state}
      onCheckedChange={() => setMany(ids, onPage !== ids.length)}
      aria-label={onPage === ids.length ? "Clear selection" : "Select all on this page"}
    />
  );
}
