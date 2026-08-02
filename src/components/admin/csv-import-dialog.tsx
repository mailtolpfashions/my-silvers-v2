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

// Keep in sync with CSV_TEMPLATE_HEADERS in src/server/products/admin.ts
// (that module pulls in Prisma and can't be imported client-side).
const TEMPLATE_HEADERS = [
  "name", "description", "shortDescription", "price", "compareAtPrice",
  "category", "weight", "purity", "dimensions", "sizes", "material",
  "stock", "sku", "tags", "isFeatured", "isBestseller", "isActive", "images",
];

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
  const [result, setResult] = useState<{
    created: number;
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
      complete: async (parsed) => {
        try {
          const res = await bulkImportProductsAction(parsed.data);
          setResult(res);
          if (res.created > 0) toast.success(`Imported ${res.created} products.`);
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
            Upload a CSV (max 500 rows). Valid rows are imported; invalid rows
            are reported without failing the batch.
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
                {result.created} imported · {result.errors.length} skipped
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
