"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CsvImportDialog } from "@/components/admin/csv-import-dialog";
import { ProductExportButtons } from "@/components/admin/product-export-buttons";
import { ProductBulkBar } from "@/components/admin/product-bulk-bar";
import { useBulkSelect } from "@/components/admin/bulk-select";
import { listMatchingProductIdsAction } from "@/actions/admin-product-actions";

/** The list's current filters, as getAdminProducts reads them. */
export type ProductListFilters = {
  q?: string;
  categoryId?: string;
  vendor?: string;
  active?: "active" | "inactive";
  stock?: "in" | "out";
  flag?: "featured" | "bestseller";
};

/**
 * The products page's header controls, which swap wholesale once rows are
 * ticked.
 *
 * ── Why it swaps rather than adds ───────────────────────────────────────────
 * The bulk actions first appeared in BOTH the header and a sticky bar under the
 * table, so the same five controls were on screen twice — reported, correctly,
 * as duplication. They live here only now.
 *
 * And when they appear, "Import CSV" and "Add product" go: neither does
 * anything to a selection, and leaving them made nine controls on one line. A
 * selection is a different mode, so the header becomes that mode's toolbar —
 * which is what a shopper of admin tools will recognise from Shopify and
 * WordPress both.
 *
 * ── The count lives here now ────────────────────────────────────────────────
 * It was in the sticky bar, along with Clear. Removing that bar without moving
 * them would have left no way to see how many rows are selected without
 * counting ticks, and no way to drop the selection except unticking each one.
 */
export function ProductHeaderActions({
  categories,
  vendors = [],
  total,
  filters,
}: {
  categories: Array<{ id: string; name: string }>;
  vendors?: string[];
  /** How many products match the filters, across every page. */
  total: number;
  filters: ProductListFilters;
}) {
  const { selected, clear, setMany } = useBulkSelect();
  const [isSelecting, startSelecting] = useTransition();
  const count = selected.size;

  /**
   * Reaches past the 20 rows on screen. Asks the server for the ids using the
   * same filters as the table, so it selects exactly what the count says and
   * nothing the admin filtered out.
   */
  function selectAllMatching() {
    startSelecting(async () => {
      const result = await listMatchingProductIdsAction(filters);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setMany(result.ids, true);
      if (result.total > result.ids.length) {
        toast.warning(
          `Selected the first ${result.ids.length} of ${result.total} — the most one action can take.`
        );
      }
    });
  }

  if (count > 0) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm font-medium">
          {count} selected
          <button
            type="button"
            onClick={clear}
            className="ml-2 font-normal text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Clear
          </button>
          {count < total && (
            <button
              type="button"
              onClick={selectAllMatching}
              disabled={isSelecting}
              className="ml-2 font-normal text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
            >
              {isSelecting ? "Selecting…" : `Select all ${total} matching`}
            </button>
          )}
        </span>
        <ProductBulkBar variant="header" categories={categories} vendors={vendors} />
        <ProductExportButtons />
      </div>
    );
  }

  return (
    <>
      <ProductExportButtons />
      <CsvImportDialog />
      <Button asChild size="sm">
        <Link href="/admin/products/new">Add product</Link>
      </Button>
    </>
  );
}
