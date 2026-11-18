"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { bulkImportProductsAction } from "@/actions/admin-product-actions";
import { useIsOwner } from "@/components/admin/owner-context";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CSV_TEMPLATE_HEADERS as TEMPLATE_HEADERS } from "@/lib/product-csv";

function download(filename: string, content: string, type = "text/csv") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CsvImportDialog() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const isOwner = useIsOwner();
  /** The rate this batch was bought at — rows with their own silverRate keep it. */
  const [batchRate, setBatchRate] = useState("");
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    errors: Array<{ row: number; error: string }>;
  } | null>(null);

  function handleFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setImporting(true);
    setResult(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      // Undo the export's formula guard (server/admin/csv.ts): a cell it wrote
      // as '=… or '-… comes back as the original text, so an export re-imported
      // as-is does not gain apostrophes.
      transform: (value) => (/^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value),
      complete: async (parsed) => {
        try {
          const rate = Number(batchRate);
          const res = await bulkImportProductsAction(
            parsed.data,
            isOwner && batchRate.trim() !== "" && Number.isFinite(rate) && rate > 0 ? rate : null
          );
          setResult(res);
          if (res.created + res.updated > 0) {
            toast.success(`${res.created} added, ${res.updated} updated.`);
          }
          if (res.errors.length > 0) toast.warning(`${res.errors.length} rows were skipped.`);
        } catch {
          toast.error("Import failed. Please check the file and try again.");
        } finally {
          setImporting(false);
          if (inputRef.current) inputRef.current.value = "";
        }
      },
      error: () => {
        toast.error("Could not parse the CSV file.");
        setImporting(false);
      },
    });
  }

  function downloadErrorReport() {
    if (!result) return;
    const csv = ["row,error", ...result.errors.map((e) => `${e.row},"${e.error.replace(/"/g, '""')}"`)].join("\r\n");
    download("import-errors.csv", csv);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk import products</DialogTitle>
          <DialogDescription>
            Upload a CSV (max 500 rows). A new SKU adds a product; a SKU already
            in the shop updates it, changing only the cells you filled in — so a
            file with just sku and price updates prices. Tags are added to the
            ones a product already has, never replacing them. For sizes, write
            each with its stock — &ldquo;5:2, 6:1, 7:4&rdquo; — and leave stock
            blank; it is added up for you. Invalid rows are listed without
            stopping the rest.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => download("products-template.csv", TEMPLATE_HEADERS.join(",") + "\r\n")}
          >
            Download template
          </Button>

          {/* Owner only: costs are the owner's. Applies to every row with a
              silverWeight and no silverRate of its own, and is saved on each
              product — a later change in the market never re-costs them. */}
          {isOwner && (
            <div className="space-y-1.5 rounded-md border border-dashed p-3">
              <Label htmlFor="batch-silver-rate">Silver rate for this batch (₹ per gram)</Label>
              <Input
                id="batch-silver-rate"
                inputMode="decimal"
                placeholder="e.g. 105"
                value={batchRate}
                disabled={importing}
                onChange={(e) => setBatchRate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The rate you bought this batch at. Used for every row with a silverWeight, unless the
                row has its own silverRate. Saved on each product, so a later fall in the rate never
                changes its cost. Put each piece&apos;s makingCharge in the file.
              </p>
            </div>
          )}

          <Button
            onClick={() => inputRef.current?.click()}
            disabled={importing}
            className="w-full"
          >
            {importing ? "Importing…" : "Choose CSV file"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => handleFile(e.target.files)}
          />

          {result && (
            <div className="rounded-md bg-muted p-3 text-sm">
              <p>
                {result.created} added · {result.updated} updated · {result.errors.length} skipped
              </p>
              {result.errors.length > 0 && (
                <>
                  <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                    {result.errors.slice(0, 10).map((e, i) => (
                      <li key={i}>
                        Row {e.row}: {e.error}
                      </li>
                    ))}
                    {result.errors.length > 10 && <li>…and {result.errors.length - 10} more</li>}
                  </ul>
                  <Button variant="link" size="sm" className="mt-1 px-0" onClick={downloadErrorReport}>
                    Download full error report
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
