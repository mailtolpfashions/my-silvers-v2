import { EditorialTile } from "@/components/storefront/editorial-tile";
import type { CollectionSummary } from "@/server/cms/collections";

/**
 * A collection, presented as an editorial tile.
 *
 * This used to be a rounded card with a full-height gradient scrim and the
 * title, eyebrow and description burned onto the photograph, plus an "Explore"
 * that appeared on hover. It sat on the homepage directly beside a product card
 * that had already shed its border, radius, shadow and scrim — two card systems
 * on one page, which made both look accidental.
 *
 * It is now a thin wrapper over the shared tile, kept as its own component only
 * so the CMS shape (`thumbnailImage`, `eyebrow`) is mapped in one place rather
 * than at every call site.
 */
export function CollectionCard({
  collection,
  preload = false,
}: {
  collection: CollectionSummary;
  /** Set on above-the-fold tiles only — see next/image `preload`. */
  preload?: boolean;
}) {
  return (
    <EditorialTile
      href={`/collections/${collection.slug}`}
      image={collection.thumbnailImage}
      title={collection.title}
      eyebrow={collection.eyebrow}
      description={collection.description}
      linkLabel="Explore the collection"
      preload={preload}
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
    />
  );
}
