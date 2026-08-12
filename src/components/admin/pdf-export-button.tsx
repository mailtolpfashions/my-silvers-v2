"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadTablePdf } from "@/lib/pdf-export";

export function PdfExportButton({
  endpoint,
  filename,
  label = "Export PDF",
}: {
  endpoint: string;
  filename: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      // `&` when the endpoint already carries a query, not a second `?`. The
      // products export now passes ?ids= for a selection, and appending
      // "?format=json" to that produced "?ids=a,b?format=json" — one malformed
      // parameter, so the server saw no format and returned CSV to a PDF
      // builder.
      const res = await fetch(`${endpoint}${endpoint.includes("?") ? "&" : "?"}format=json`);
      if (!res.ok) throw new Error("Export failed");
      const data = (await res.json()) as {
        title: string;
        headers: string[];
        rows: string[][];
      };
      await downloadTablePdf({ ...data, filename });
    } catch {
      toast.error("Could not generate the PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" size="sm" disabled={busy} onClick={handleClick}>
      {busy ? "Generating…" : label}
    </Button>
  );
}
