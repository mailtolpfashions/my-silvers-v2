"use client";

import { Button } from "@/components/ui/button";

/**
 * Opens the browser's print dialogue, which is also how the customer saves a
 * PDF — every browser offers "Save as PDF" as a destination. `print:hidden` so
 * the button never appears on the printed sheet.
 *
 * "Save" capitalised although buttons are sentence case everywhere else: the
 * slash joins two separate actions, and each reads as its own label (owner's
 * call, Nov 2026).
 */
export function PrintButton({ label = "Print / Save as PDF" }: { label?: string }) {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
      {label}
    </Button>
  );
}
