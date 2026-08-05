"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * The mobile search trigger.
 *
 * A full-width search field used to occupy its own row under the header, which
 * cost ~57px of every screen on a phone before any content appeared. Collapsing
 * it to an icon that opens a sheet is what GIVA and Mia both do, and it buys
 * back that row.
 *
 * `children` is the server-rendered SearchBox, passed in rather than built here
 * so it keeps its CMS placeholders and catalogue-derived chips — a client
 * component can render a server component as children.
 */
export function MobileSearch({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Search"
        onClick={() => setOpen(true)}
        className="size-10 md:hidden"
      >
        <Search className="size-6" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          // Anchored to the top rather than centred: the field should land under
          // the thumb-free part of the screen with the keyboard rising to meet
          // it, not float in the middle with results pushed off screen.
          className="top-4 max-w-[calc(100%-1rem)] translate-y-0 p-3 sm:max-w-lg"
          // Radix moves focus to the first focusable child on open, which is the
          // input — so the keyboard appears without an extra tap.
          onOpenAutoFocus={(e) => {
            // Let Radix do it, but keep the page behind from scrolling to the
            // dialog's own position first.
            e.preventDefault();
            (e.currentTarget as HTMLElement)
              .querySelector<HTMLInputElement>('input[type="search"]')
              ?.focus();
          }}
        >
          <DialogTitle className="sr-only">Search products</DialogTitle>
          {children}
        </DialogContent>
      </Dialog>
    </>
  );
}
