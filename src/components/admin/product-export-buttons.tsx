"use client";

import { Button } from "@/components/ui/button";
import { PdfExportButton } from "@/components/admin/pdf-export-button";
import { useBulkSelect } from "@/components/admin/bulk-select";

/**
 * The page's CSV and PDF exports, which follow the row selection.
 *
 * ── Why these moved out of the page header's markup ─────────────────────────
 * There were briefly TWO exports on this screen: one in the header covering the
 * whole catalogue, and one in the bulk bar covering the selection. Two buttons
 * with the same word on them, doing different things, a few hundred pixels
 * apart — you had to know which was which. There is one of each now, and it
 * exports whatever is currently in scope.
 *
 * The label carries the difference, because the button's position no longer
 * can: "Export CSV" with nothing ticked, "Export 3 as CSV" with three. A
 * control whose meaning changes silently is worse than two controls.
 *
 * Must be rendered inside BulkSelectProvider — which is why that provider wraps
 * the whole page rather than just the table.
 */
export function ProductExportButtons() {
  const { selected } = useBulkSelect();
  const ids = [...selected];
  const scoped = ids.length > 0;

  // The API takes ?ids= and falls back to the full catalogue without it, so one
  // endpoint serves both cases.
  const query = scoped ? `?ids=${ids.join(",")}` : "";

  return (
    <>
      <Button asChild variant="outline" size="sm">
        <a href={`/api/admin/export/products${query}`}>
          {scoped ? `Export ${ids.length} as CSV` : "Export CSV"}
        </a>
      </Button>
      <PdfExportButton
        // PdfExportButton adds its own `format=json`, joining with `&` when a
        // query is already present — it had to be taught to do that, see the
        // note there.
        endpoint={`/api/admin/export/products${query}`}
        filename="products.pdf"
        label={scoped ? `Export ${ids.length} as PDF` : "Export PDF"}
      />
    </>
  );
}
