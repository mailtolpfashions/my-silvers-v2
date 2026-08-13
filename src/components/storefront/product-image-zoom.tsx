"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { X, ZoomIn } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useSwipe } from "@/lib/use-swipe";

/** How far a click inside the lightbox magnifies. */
const MODAL_SCALE = 2.5;

type Origin = { x: number; y: number };
const CENTRE: Origin = { x: 50, y: 50 };

/** Cursor position within an element, as a percentage of its box. */
function originFromEvent(
  event: React.MouseEvent<HTMLElement>,
  element: HTMLElement | null,
): Origin {
  const box = (element ?? event.currentTarget).getBoundingClientRect();
  return {
    x: ((event.clientX - box.left) / box.width) * 100,
    y: ((event.clientY - box.top) / box.height) * 100,
  };
}

/**
 * Opens the product image full screen. The image in the page does not react to
 * the cursor at all.
 *
 * ── The hover magnifier was removed, deliberately ────────────────────────────
 * This used to also carry a lens: moving the pointer over the image scaled it
 * 2.2× and tracked the cursor. It was cheap and it worked, and it still went,
 * because the lightbox below already does the same job better — bigger, at a
 * larger source, pannable, and reachable from a phone. Two zooms on one image
 * meant the page magnified itself under a pointer that was only passing over
 * it, and the accidental version was the worse of the two.
 *
 * So the interaction is now one thing at every width and on every input: click,
 * tap or Enter opens the full-screen view. Do not reintroduce a hover
 * behaviour here without removing the lightbox first — the reason this is a
 * single gesture is that the picture should hold still until it is asked not
 * to.
 */
export function ProductImageZoom({
  src,
  alt,
  onPrev,
  onNext,
  children,
}: {
  src: string;
  alt: string;
  /** Swipe right → previous image. Omitted when there is only one. */
  onPrev?: () => void;
  /** Swipe left → next image. */
  onNext?: () => void;
  /**
   * The image to magnify. Passed in rather than rendered here so slide 0 can
   * keep the server-rendered <Image> that carries the view-transition name and
   * the preload hint — re-rendering it here would break the card → page morph.
   */
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // Shared with the hero carousel — same gesture, same two traps.
  const swipe = useSwipe({ onPrev, onNext });

  return (
    <>
      <div
        {...swipe.handlers}
        // pan-y keeps vertical scrolling native while telling the browser not to
        // handle horizontal gestures itself, which would otherwise fight this.
        // product-frame: 4:5 on a phone, one screen tall from lg. See the block
        // in globals.css — it is why the first photograph now fits the window.
        className="product-frame group relative touch-pan-y overflow-hidden bg-muted"
      >
        {children}

        {/* A transparent overlay owns the pointer rather than the image owning
            it: `children` is sometimes the server-rendered <Image> carrying the
            view-transition name, and attaching handlers to it here would mean
            re-rendering it and breaking the card → page morph. */}
        <button
          type="button"
          aria-label={`Open ${alt} at full size`}
          onClick={() => {
            // A swipe must not also open the lightbox.
            if (swipe.consumeSwipe()) return;
            setOpen(true);
          }}
          className="absolute inset-0 cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />

        {/* Affordance — without it nothing tells a shopper the image opens. It
            matters more now than it did: with the hover magnifier gone this is
            the only thing that answers the cursor at all.
            pointer-events-none so it never blocks the overlay button. */}
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-3 right-3 flex size-9 items-center justify-center bg-background/85 text-foreground opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100 motion-reduce:transition-none"
        >
          <ZoomIn className="size-4" />
        </span>
      </div>

      <Lightbox src={src} alt={alt} open={open} onOpenChange={setOpen} />
    </>
  );
}

/** Full-screen view. Click the image to magnify further and pan with the cursor. */
function Lightbox({
  src,
  alt,
  open,
  onOpenChange,
}: {
  src: string;
  alt: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState<Origin>(CENTRE);
  const frameRef = useRef<HTMLDivElement | null>(null);

  // Reset on close so reopening never starts mid-pan on a stale position.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setZoomed(false);
      setOrigin(CENTRE);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-none border-0 bg-transparent p-0 ring-0 shadow-none sm:max-w-none"
        style={{ width: "min(96vw, 1100px)" }}
      >
        {/* Required by Radix for an accessible name; the image carries the
            visible label, so this is screen-reader only. */}
        <DialogTitle className="sr-only">{alt}</DialogTitle>

        <div
          ref={frameRef}
          // Square, matching every other product frame. It was 4:5, which on
          // any window shorter than about 1150px was flattened into a landscape
          // box by max-h — so the one surface meant to show the piece properly
          // was also the one whose shape changed with the window.
          className="relative aspect-square max-h-[90vh] w-full overflow-hidden bg-black"
        >
          <div
            className="absolute inset-0 transition-transform duration-200 ease-out motion-reduce:transition-none"
            style={{
              transform: zoomed ? `scale(${MODAL_SCALE})` : "scale(1)",
              transformOrigin: `${origin.x}% ${origin.y}%`,
            }}
          >
            <Image
              src={src}
              alt={alt}
              fill
              // Bigger than the page's 45vw slot: this is the view where detail
              // is the entire point, so it earns a larger source.
              sizes="(max-width: 640px) 100vw, 1100px"
              className="object-contain"
            />
          </div>

          <button
            type="button"
            aria-label={zoomed ? "Zoom out" : "Zoom in"}
            onClick={(e) => {
              setOrigin(originFromEvent(e, frameRef.current));
              setZoomed((z) => !z);
            }}
            onMouseMove={(e) => {
              if (!zoomed) return;
              setOrigin(originFromEvent(e, frameRef.current));
            }}
            className={`absolute inset-0 ${zoomed ? "cursor-zoom-out" : "cursor-zoom-in"}`}
          />
        </div>

        <DialogClose
          aria-label="Close"
          className="absolute -top-2 right-0 flex size-10 -translate-y-full items-center justify-center bg-background/90 text-foreground backdrop-blur-sm transition-colors hover:bg-background"
        >
          <X className="size-5" />
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
