"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { X, ZoomIn } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";

/** Horizontal travel, in px, that counts as a swipe rather than a tap. */
const SWIPE_MIN = 45;
/** Travel after which the gesture is committed to horizontal, not vertical. */
const SWIPE_LOCK = 12;

/** How far the hover lens magnifies the main image. */
const HOVER_SCALE = 2.2;
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
 * Hover-to-magnify over the product image, plus a full-screen lightbox.
 *
 * The magnifier is a CSS transform on the existing <Image> rather than a second,
 * larger download: Next already serves this image at up to 45vw, so scaling the
 * decoded bitmap costs nothing extra and there is no second network request to
 * wait for. It composites on the GPU, so following the cursor stays smooth.
 *
 * Hover zoom is gated on a fine pointer. On touch there is no hover state, so a
 * tap opens the lightbox instead — which is the only sensible zoom on a phone
 * anyway, where the image is already full-bleed.
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
  const [origin, setOrigin] = useState<Origin>(CENTRE);
  const [zooming, setZooming] = useState(false);
  const [open, setOpen] = useState(false);
  const frameRef = useRef<HTMLDivElement | null>(null);

  /**
   * Touch swipe between images.
   *
   * A ref, not state: none of this should re-render mid-gesture, and the click
   * handler has to read the final value synchronously — a state update would
   * not have landed by the time click fires after touchend.
   */
  const touch = useRef<{ x: number; y: number; horizontal: boolean } | null>(null);
  const swiped = useRef(false);

  function handleTouchStart(event: React.TouchEvent) {
    const t = event.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, horizontal: false };
    swiped.current = false;
  }

  function handleTouchMove(event: React.TouchEvent) {
    const start = touch.current;
    if (!start) return;
    const t = event.touches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // Only claim the gesture once it is clearly sideways. Without this, a
    // slightly-diagonal scroll down the page would flick the image instead.
    if (!start.horizontal && Math.abs(dx) > SWIPE_LOCK && Math.abs(dx) > Math.abs(dy)) {
      start.horizontal = true;
    }
  }

  function handleTouchEnd(event: React.TouchEvent) {
    const start = touch.current;
    touch.current = null;
    if (!start?.horizontal) return;

    const dx = event.changedTouches[0].clientX - start.x;
    if (Math.abs(dx) < SWIPE_MIN) return;

    // Marks the gesture so the click that follows touchend does not also open
    // the lightbox — a swipe and a tap are different intentions.
    swiped.current = true;
    if (dx < 0) onNext?.();
    else onPrev?.();
  }

  const handleMove = useCallback((event: React.MouseEvent<HTMLElement>) => {
    // matchMedia on every move is cheap and always current — a laptop with a
    // touchscreen can switch between the two mid-session.
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    setOrigin(originFromEvent(event, frameRef.current));
    setZooming(true);
  }, []);

  return (
    <>
      <div
        ref={frameRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        // pan-y keeps vertical scrolling native while telling the browser not to
        // handle horizontal gestures itself, which would otherwise fight this.
        className="group relative aspect-[4/5] touch-pan-y overflow-hidden rounded-md bg-muted"
      >
        <div
          className="absolute inset-0 transition-transform duration-200 ease-out motion-reduce:transition-none"
          style={{
            transform: zooming ? `scale(${HOVER_SCALE})` : "scale(1)",
            transformOrigin: `${origin.x}% ${origin.y}%`,
          }}
        >
          {children}
        </div>

        {/* A transparent overlay owns the pointer, so the transform underneath
            can never swallow a mousemove or steal the click. */}
        <button
          type="button"
          aria-label={`Open ${alt} at full size`}
          onMouseMove={handleMove}
          onMouseLeave={() => setZooming(false)}
          onClick={() => {
            if (swiped.current) {
              swiped.current = false;
              return;
            }
            setOpen(true);
          }}
          className="absolute inset-0 cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />

        {/* Affordance — without it nothing tells a shopper the image is zoomable.
            pointer-events-none so it never blocks the overlay button. */}
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-3 right-3 flex size-9 items-center justify-center rounded-full bg-background/85 text-foreground opacity-0 shadow-sm backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100 motion-reduce:transition-none"
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
          className="relative aspect-[4/5] max-h-[90vh] w-full overflow-hidden rounded-lg bg-graphite-950"
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
          className="absolute -top-2 right-0 flex size-10 -translate-y-full items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background"
        >
          <X className="size-5" />
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
