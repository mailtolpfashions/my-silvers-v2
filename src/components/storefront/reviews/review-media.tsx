"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Play, X } from "lucide-react";
import { reviewVideoPosterUrl, reviewVideoUrl } from "@/lib/cloudinary-video";

/**
 * The photos and clip a customer attached, under their review.
 *
 * Thumbnails, then a lightbox — not inline full-size media. A product with
 * fifty reviews could otherwise carry two hundred images and fifty videos on
 * one page, which is a page nobody on a phone connection ever finishes loading.
 * The thumbnails are 96px and Cloudinary is asked for exactly that (`sizes`),
 * and the clip does not load a single byte of video until someone opens it —
 * `preload="none"`, and the element does not exist before then.
 */
export function ReviewMedia({
  imageUrls,
  videoUrl,
  authorName,
}: {
  imageUrls: string[];
  videoUrl: string | null;
  authorName: string;
}) {
  const [open, setOpen] = useState<{ kind: "image"; url: string } | { kind: "video" } | null>(null);

  // Escape closes it. The Dialog primitive gives this for free and a hand-rolled
  // overlay does not — without it the only way out is finding the X, which on a
  // full-bleed photo is genuinely hard to spot.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (imageUrls.length === 0 && !videoUrl) return null;

  const poster = videoUrl ? reviewVideoPosterUrl(videoUrl) : undefined;

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        {imageUrls.map((url, i) => (
          <button
            key={url}
            type="button"
            onClick={() => setOpen({ kind: "image", url })}
            className="relative size-20 overflow-hidden rounded-md border transition-opacity hover:opacity-80"
            aria-label={`Open photo ${i + 1} from ${authorName}'s review`}
          >
            <Image
              src={url}
              alt={`Photo ${i + 1} from ${authorName}'s review`}
              fill
              sizes="80px"
              className="object-cover"
            />
          </button>
        ))}

        {videoUrl && (
          <button
            type="button"
            onClick={() => setOpen({ kind: "video" })}
            className="relative size-20 overflow-hidden rounded-md border bg-black transition-opacity hover:opacity-80"
            aria-label={`Play the video from ${authorName}'s review`}
          >
            {poster && (
              <Image
                src={poster}
                alt=""
                fill
                sizes="80px"
                className="object-cover opacity-80"
              />
            )}
            <span className="absolute inset-0 grid place-items-center">
              <Play className="size-6 fill-white text-white drop-shadow" />
            </span>
          </button>
        )}
      </div>

      {open && (
        // A plain fixed overlay rather than the Dialog primitive: this holds one
        // element and needs no header, description or form semantics, and the
        // whole backdrop being the close target is the behaviour people expect
        // from a photo viewer.
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Media from ${authorName}'s review`}
          className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4"
          onClick={() => setOpen(null)}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(null)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <X className="size-5" />
          </button>

          {/* Stops a click on the media itself closing the viewer. */}
          <div className="max-h-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            {open.kind === "image" ? (
              <Image
                src={open.url}
                alt={`Photo from ${authorName}'s review`}
                width={1200}
                height={1200}
                sizes="(max-width: 768px) 100vw, 768px"
                className="max-h-[85vh] w-auto object-contain"
              />
            ) : (
              // autoPlay because opening it IS the request to play; controls so
              // it can be paused, scrubbed and muted like any other video.
              <video
                src={reviewVideoUrl(videoUrl!)}
                poster={poster}
                controls
                autoPlay
                playsInline
                className="max-h-[85vh] w-auto"
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
