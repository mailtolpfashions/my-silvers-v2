"use client";

import { TableHead } from "@/components/ui/table";
import {
  SortLabel,
  SORT_TRIGGER_CLASS,
  ariaSort,
  type SortDir,
} from "@/components/admin/sort-indicator";

/**
 * A column header that toggles sorting in local state.
 *
 * The state-driven twin of {@link SortableHeader}, for tables whose rows are
 * held in React rather than fetched per navigation — see useTableSort for why
 * those cannot use the URL. A real <button>, not a clickable <th>: it has to be
 * reachable and operable from the keyboard, and the header cell itself is not.
 */
export function SortableHeaderButton({
  column,
  label,
  currentSort,
  currentDir,
  onToggle,
  className,
}: {
  column: string;
  label: string;
  currentSort: string;
  currentDir: SortDir;
  onToggle: (column: string) => void;
  className?: string;
}) {
  const active = currentSort === column;

  return (
    // aria-sort lives here, on the header cell itself — see ariaSort().
    <TableHead className={className} aria-sort={ariaSort(active, currentDir)}>
      <button type="button" onClick={() => onToggle(column)} className={SORT_TRIGGER_CLASS}>
        <SortLabel label={label} active={active} dir={currentDir} />
      </button>
    </TableHead>
  );
}
