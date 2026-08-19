import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Page controls for an admin list.
 *
 * ── One component, because there were three ──────────────────────────────────
 * Orders had its own markup, Reviews and Payments shared a second copy between
 * them, and Customers had none at all — it simply stopped at 100 rows without
 * saying so. Three spellings of the same control is how a panel starts feeling
 * like several products.
 *
 * ── It always states the total ───────────────────────────────────────────────
 * `Page 2 of 7 — 154 customers`, not just the page numbers. A list that shows
 * a slice must say how big the whole is, or the operator has no way to tell a
 * short page from a filtered one, and no way to notice that the thing they are
 * looking for is on a page they have not opened.
 *
 * A server component: pagination is links, nothing here needs the browser, and
 * that lets the caller pass a plain href-building function.
 */
export function AdminPagination({
  page,
  totalPages,
  total,
  /** Plural noun for the total — "orders", "customers", "reviews". */
  label,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  total: number;
  label: string;
  hrefFor: (page: number) => string;
}) {
  // A single page still reports the total; only the buttons are pointless.
  if (totalPages <= 1) {
    return (
      <p className="text-sm text-muted-foreground">
        {total} {label}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages} — {total} {label}
      </p>
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm" disabled={page <= 1}>
          <Link
            href={hrefFor(page - 1)}
            // aria-disabled rather than removing the link: a control that
            // vanishes at the edges makes the row jump as you page through.
            aria-disabled={page <= 1}
            className={page <= 1 ? "pointer-events-none opacity-50" : ""}
          >
            Previous
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm" disabled={page >= totalPages}>
          <Link
            href={hrefFor(page + 1)}
            aria-disabled={page >= totalPages}
            className={page >= totalPages ? "pointer-events-none opacity-50" : ""}
          >
            Next
          </Link>
        </Button>
      </div>
    </div>
  );
}
