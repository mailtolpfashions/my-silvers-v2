"use client";

import { createContext, useContext, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * Search, at every width, behind an icon.
 *
 * This replaces the 640px rounded pill that used to sit in the middle of the
 * header. That field was the loudest element on every page, and a large centred
 * search box is the marketplace signal — Amazon, Flipkart, Myntra all lead with
 * it, and it tells a first-time visitor "we have a lot of stock, go dig". A
 * curated brand puts navigation first and search behind a glyph.
 *
 * Nothing about search itself changed. `children` is the server-rendered
 * SearchBox, passed in rather than constructed here so it keeps its CMS
 * placeholders, catalogue-derived chips, typeahead, recent searches and the
 * existing /api/search/suggestions call. A client component can render a server
 * component as children — that is the whole reason for the slot.
 *
 * Replaces the old mobile-only MobileSearch, which was the same idea applied at
 * one breakpoint.
 */
/**
 * Lets the SearchBox inside close the overlay when it navigates.
 *
 * ⚠️  Without this the overlay outlived the search. Picking a suggestion
 * closed the box's own dropdown and pushed the new route, but this Dialog's
 * `open` never changed — so the results page loaded underneath a still-open
 * overlay, and Radix's focus trap put the cursor straight back in the field.
 * On a phone that read as "it searched, then opened the search again".
 *
 * Outside an overlay (the inline search on /products) it is a no-op.
 */
const CloseSearchContext = createContext<() => void>(() => {});

export function useCloseSearchOverlay() {
  return useContext(CloseSearchContext);
}

export function SearchOverlay({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Search"
        onClick={() => setOpen(true)}
        className="size-10 rounded-none md:size-11"
      >
        <Search className="size-5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          // A band across the top of the viewport rather than a centred modal:
          // the field lands where the header's own search would have been, so
          // the overlay reads as the header expanding rather than as a dialog
          // interrupting. On a phone that also puts the input above the
          // keyboard instead of behind it.
          className="top-0 max-w-none translate-y-0 rounded-none border-x-0 border-t-0 p-4 sm:top-0 sm:max-w-none sm:p-6"
          onOpenAutoFocus={(event) => {
            // Radix would focus the first focusable child anyway; doing it by
            // hand avoids the page behind scrolling to the dialog first.
            event.preventDefault();
            (event.currentTarget as HTMLElement)
              .querySelector<HTMLInputElement>('input[type="search"]')
              ?.focus();
          }}
        >
          <DialogTitle className="sr-only">Search products</DialogTitle>
          <div className="container-page">
            {/* A visible way out. The default close button is off (it would
                sit over the field), and on a phone there was otherwise none —
                only tapping the dimmed page, which nothing told you about. */}
            <div className="mx-auto flex max-w-2xl items-start gap-3">
              <div className="min-w-0 flex-1">
                <CloseSearchContext.Provider value={() => setOpen(false)}>
                  {children}
                </CloseSearchContext.Provider>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="mt-2 shrink-0 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Cancel
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
