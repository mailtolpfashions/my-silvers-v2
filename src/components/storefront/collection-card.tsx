import Link from "next/link";
import Image from "next/image";
import type { CollectionSummary } from "@/server/cms/collections";

export function CollectionCard({
  collection,
  priority = false,
}: {
  collection: CollectionSummary;
  priority?: boolean;
}) {
  return (
    <Link href={`/collections/${collection.slug}`} className="group block">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted">
        {collection.thumbnailImage ? (
          <Image
            src={collection.thumbnailImage}
            alt={collection.title}
            fill
            priority={priority}
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {collection.title}
          </div>
        )}

        {/* Copy sits on the image, so it needs a scrim to stay readable. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 p-5">
          {collection.eyebrow && (
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-light">
              {collection.eyebrow}
            </p>
          )}
          <h3 className="font-heading text-xl text-white">{collection.title}</h3>
          {collection.description && (
            <p className="mt-1 line-clamp-2 text-sm text-white/80">{collection.description}</p>
          )}
        </div>
      </div>
    </Link>
  );
}
