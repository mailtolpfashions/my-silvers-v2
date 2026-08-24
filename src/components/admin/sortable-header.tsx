import Link from "next/link";
import { TableHead } from "@/components/ui/table";
import {
  SortLabel,
  SORT_TRIGGER_CLASS,
  ariaSort,
  type SortDir,
} from "@/components/admin/sort-indicator";

/**
 * A column header that toggles sorting via the URL.
 *
 * A plain server component with a real <Link>, not a client component: the page
 * already reads searchParams, so the current state is in hand, and sorting a
 * table should survive a refresh and be shareable as a link. Nothing here needs
 * to run in the browser.
 *
 * For a table whose rows live in React state rather than in a database query,
 * use SortableHeaderButton instead — same arrow, same styling, local state.
 */
export function SortableHeader({
  basePath,
  column,
  label,
  currentSort,
  currentDir,
  params,
  className,
  sortKey = "sort",
  dirKey = "dir",
}: {
  /** The table’s own route, e.g. "/admin/orders". */
  basePath: string;
  /** Must be one of the allowlisted sort keys for this table. */
  column: string;
  label: string;
  currentSort: string;
  currentDir: SortDir;
  /** Every other query param, so filters and search survive the click. */
  params: Record<string, string | undefined>;
  className?: string;
  /**
   * Query-param names for this table's sort state.
   *
   * Overridable because a page can carry more than one independent table —
   * /admin/inventory has three. Sharing `sort`/`dir` across them would mean
   * clicking one table's header silently reorders the others, so each names
   * its own pair.
   */
  sortKey?: string;
  dirKey?: string;
}) {
  const active = currentSort === column;
  // Clicking the active column flips it; a new column starts ascending, which
  // is the natural reading for names, SKUs and categories.
  const nextDir: SortDir = active && currentDir === "asc" ? "desc" : "asc";

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    // `page` is dropped on purpose: re-sorting while on page 4 would otherwise
    // land the admin in the middle of a list they have not seen the start of.
    if (value && key !== sortKey && key !== dirKey && key !== "page") {
      query.set(key, value);
    }
  }
  query.set(sortKey, column);
  query.set(dirKey, nextDir);

  return (
    // aria-sort lives here, on the header cell itself — see ariaSort().
    <TableHead className={className} aria-sort={ariaSort(active, currentDir)}>
      <Link href={`${basePath}?${query.toString()}`} className={SORT_TRIGGER_CLASS}>
        <SortLabel label={label} active={active} dir={currentDir} />
      </Link>
    </TableHead>
  );
}
