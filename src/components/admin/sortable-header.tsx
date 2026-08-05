import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";

/**
 * A column header that toggles sorting via the URL.
 *
 * A plain server component with a real <Link>, not a client component: the page
 * already reads searchParams, so the current state is in hand, and sorting a
 * table should survive a refresh and be shareable as a link. Nothing here needs
 * to run in the browser.
 */
export function SortableHeader({
  basePath,
  column,
  label,
  currentSort,
  currentDir,
  params,
  className,
}: {
  /** The table’s own route, e.g. "/admin/orders". */
  basePath: string;
  /** Must be one of the allowlisted sort keys for this table. */
  column: string;
  label: string;
  currentSort: string;
  currentDir: "asc" | "desc";
  /** Every other query param, so filters and search survive the click. */
  params: Record<string, string | undefined>;
  className?: string;
}) {
  const active = currentSort === column;
  // Clicking the active column flips it; a new column starts ascending, which
  // is the natural reading for names, SKUs and categories.
  const nextDir = active && currentDir === "asc" ? "desc" : "asc";

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    // `page` is dropped on purpose: re-sorting while on page 4 would otherwise
    // land the admin in the middle of a list they have not seen the start of.
    if (value && key !== "sort" && key !== "dir" && key !== "page") {
      query.set(key, value);
    }
  }
  query.set("sort", column);
  query.set("dir", nextDir);

  const Icon = active ? (currentDir === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;

  return (
    <TableHead className={className}>
      <Link
        href={`${basePath}?${query.toString()}`}
        aria-sort={active ? (currentDir === "asc" ? "ascending" : "descending") : "none"}
        className="group inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
      >
        {label}
        <Icon
          className={`size-3.5 shrink-0 transition-colors ${
            // The neutral double-chevron is dimmed until hover so seven of them
            // don't compete with the one column actually in effect.
            active ? "text-brass-text" : "text-muted-foreground/40 group-hover:text-muted-foreground"
          }`}
          aria-hidden
        />
      </Link>
    </TableHead>
  );
}
