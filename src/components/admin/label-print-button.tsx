"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens the print window for the address labels page. */
export function LabelPrintButton() {
  return (
    <Button size="sm" onClick={() => window.print()}>
      <Printer className="size-4" aria-hidden />
      Print labels
    </Button>
  );
}
