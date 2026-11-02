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

  // The PDF builder still sends ids in the URL, which only holds so many — so
  // a large selection offers the CSV (sent as a form, no limit) and says so.
  const pdfLimit = 200;
  const query = scoped ? `?ids=${ids.join(",")}` : "";

  return (
    <>
      {scoped ? (
        // A form POST rather than ?ids= in a link: a selection can now run to
        // 1,000 rows, far past what a URL holds. See the export route.
        <form method="post" action="/api/admin/export/products">
          <input type="hidden" name="ids" value={ids.join(",")} />
          <Button type="submit" variant="outline" size="sm">
            Export {ids.length} as CSV
          </Button>
        </form>
      ) : (
        <Button asChild variant="outline" size="sm">
          <a href="/api/admin/export/products">Export CSV</a>
        </Button>
      )}
      {ids.length <= pdfLimit ? (
        <PdfExportButton
          // PdfExportButton adds its own `format=json`, joining with `&` when a
          // query is already present — it had to be taught to do that, see the
          // note there.
          endpoint={`/api/admin/export/products${query}`}
          filename="products.pdf"
          label={scoped ? `Export ${ids.length} as PDF` : "Export PDF"}
        />
      ) : (
        <Button variant="outline" size="sm" disabled title={`PDF export takes up to ${pdfLimit} products — use CSV for more.`}>
          PDF: {pdfLimit} max
        </Button>
      )}
    </>
  );
}
