"use client";

import { useMemo, useState } from "react";
import { sortRows, type SortDir, type SortValue } from "@/lib/sort-rows";

export type { SortValue };

/**
 * Client-side sorting for a table whose rows live in React state.
 *
 * The server-rendered admin tables sort through the URL, which is the better
 * mechanism — it survives a refresh and can be shared. That is not available to
 * the finance managers: their rows are held in state and mutated in place by
 * server actions, so navigating to re-sort would throw away the edit in
 * progress. This reorders the array it is given, and nothing else.
 *
 * The comparison rules live in sortRows, shared with the server-rendered table
 * that has the same problem — see lib/sort-rows.ts.
 */
export function useTableSort<T>({
  rows,
  columns,
  initialColumn,
  initialDir = "asc",
}: {
  rows: T[];
  /** Column key → how to read the value being compared. */
  columns: Record<string, (row: T) => SortValue>;
  initialColumn: string;
  initialDir?: SortDir;
}) {
  const [sort, setSort] = useState(initialColumn);
  const [dir, setDir] = useState<SortDir>(initialDir);

  const sorted = useMemo(() => {
    const read = columns[sort];
    // An unknown key leaves the rows exactly as the server ordered them, rather
    // than throwing — the header could not have produced it, but a stale piece
    // of state after a column is renamed should degrade quietly.
    if (!read) return rows;
    return sortRows(rows, read, dir);
  }, [rows, columns, sort, dir]);

  /** Clicking the active column flips it; a new column starts ascending. */
  function toggle(column: string) {
    if (column === sort) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(column);
      setDir("asc");
    }
  }

  return { rows: sorted, sort, dir, toggle };
}
