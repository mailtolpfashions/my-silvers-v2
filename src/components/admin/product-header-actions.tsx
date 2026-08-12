"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CsvImportDialog } from "@/components/admin/csv-import-dialog";
import { ProductExportButtons } from "@/components/admin/product-export-buttons";
import { ProductBulkBar } from "@/components/admin/product-bulk-bar";
import { useBulkSelect } from "@/components/admin/bulk-select";

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
}: {
  categories: Array<{ id: string; name: string }>;
}) {
  const { selected, clear } = useBulkSelect();
  const count = selected.size;

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
        </span>
        <ProductBulkBar variant="header" categories={categories} />
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
