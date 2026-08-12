"use client";

import { Button } from "@/components/ui/button";

/**
 * Opens the browser's print dialogue, which is also how the customer saves a
 * PDF — every browser offers "Save as PDF" as a destination. `print:hidden` so
 * the button never appears on the printed sheet.
 */
export function PrintButton({ label = "Print / save as PDF" }: { label?: string }) {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
      {label}
    </Button>
  );
}
