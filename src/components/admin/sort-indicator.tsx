import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { SortDir } from "@/lib/sort-rows";

export type { SortDir };

/**
 * The label and arrow inside a sortable column header.
 *
 * Shared by both header variants — the URL-driven {@link SortableHeader} used
 * by server-rendered tables, and the state-driven SortableHeaderButton used by
 * the tables that keep their rows in React state. They must be visually
 * identical: an admin should not be able to tell which mechanism is behind a
 * given column, and two hand-maintained copies of this drift the first time one
 * of them is adjusted.
 */
export function SortLabel({ label, active, dir }: { label: string; active: boolean; dir: SortDir }) {
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;

  return (
    <>
      {label}
      <Icon
        className={`size-3.5 shrink-0 transition-colors ${
          // The neutral double-chevron is dimmed until hover so seven of them
          // don't compete with the one column actually in effect.
          active ? "text-black" : "text-muted-foreground/40 group-hover:text-muted-foreground"
        }`}
        aria-hidden
      />
    </>
  );
}

/** Shared trigger styling, so the link and the button are indistinguishable. */
export const SORT_TRIGGER_CLASS =
  "group inline-flex items-center gap-1.5 transition-colors hover:text-foreground";

/**
 * The `aria-sort` value for a column header.
 *
 * ⚠️  Belongs on the `<th>`, never on the link or button inside it — `aria-sort`
 * is only defined for elements with a columnheader/rowheader role, so on an
 * anchor it is silently ignored and the table reports no sort state at all.
 */
export function ariaSort(active: boolean, dir: SortDir): "ascending" | "descending" | "none" {
  if (!active) return "none";
  return dir === "asc" ? "ascending" : "descending";
}
