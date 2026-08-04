import Link from "next/link";
import Image from "next/image";
import type { CollectionSummary } from "@/server/cms/collections";

export function CollectionCard({
  collection,
  preload = false,
}: {
  collection: CollectionSummary;
  /** Set on above-the-fold cards only — see next/image `preload`. */
  preload?: boolean;
}) {
  return (
    <Link href={`/collections/${collection.slug}`} className="group block">
      {/* 3:4 portrait, matching the product card's orientation — a landscape
          collection tile beside portrait product cards read as two systems. */}
      <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-muted">
        {collection.thumbnailImage ? (
          <Image
            src={collection.thumbnailImage}
            alt={collection.title}
            fill
            preload={preload}
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {collection.title}
          </div>
        )}

        {/* Copy sits on the image, so it needs a scrim to stay readable.
            Graphite rather than pure black — black over a cool silver photo
            goes muddy, and this keeps the scrim in the same family as the ink. */}
        <div className="absolute inset-0 bg-gradient-to-t from-graphite-950/80 via-graphite-950/25 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 p-5">
          {collection.eyebrow && (
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-brass-light">
              {collection.eyebrow}
            </p>
          )}
          <h3 className="font-heading text-xl text-white">{collection.title}</h3>
          {collection.description && (
            <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-white/80">
              {collection.description}
            </p>
          )}
          {/* Appears on hover — a quiet cue that the tile is a destination. */}
          <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            Explore
            <span aria-hidden>&rarr;</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
