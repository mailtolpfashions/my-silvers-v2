import type { Metadata } from "next";
import { getCollections } from "@/server/cms/collections";
import { CollectionCard } from "@/components/storefront/collection-card";

export const metadata: Metadata = {
  title: "Collections",
  description:
    "Explore MY Silvers collections — bridal, everyday, office and oxidised sterling silver jewellery.",
};

export default async function CollectionsPage() {
  const collections = await getCollections();

  return (
    <div className="container-page py-10">
      <h1 className="text-h1">Collections</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {collections.length} {collections.length === 1 ? "collection" : "collections"}
      </p>

      {collections.length === 0 ? (
        <p className="py-20 text-center text-muted-foreground">
          No collections published yet.
        </p>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((collection, i) => (
            <CollectionCard key={collection.id} collection={collection} preload={i < 3} />
          ))}
        </div>
      )}
    </div>
  );
}
