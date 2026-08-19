import type { Metadata } from "next";
import { getCollections } from "@/server/cms/collections";
import { CollectionCard } from "@/components/storefront/collection-card";
import { PageHeader } from "@/components/storefront/page-header";
import { EditorialLink } from "@/components/storefront/editorial-link";
import { BreadcrumbJsonLd } from "@/components/storefront/structured-data";
import { RevealSection } from "@/components/storefront/reveal-section";

export const metadata: Metadata = {
  title: "Collections",
  description:
    "Explore MY Silvers collections — bridal, everyday, office and oxidised sterling silver jewellery.",
};

export default async function CollectionsPage() {
  const collections = await getCollections();

  return (
    <div>
      <BreadcrumbJsonLd trail={[{ name: "Collections", path: "/collections" }]} />

      <PageHeader
        eyebrow="Edits"
        title="Collections"
        description="Each one built around a single idea, in hallmarked 925 sterling silver."
      />

      <div className="container-page pt-10 rhythm-commerce-bottom">
        {collections.length === 0 ? (
          <div className="border-t rhythm-commerce text-center">
            <p className="text-h3">No collections yet</p>
            <p className="mt-3 text-sm text-muted-foreground">
              The full catalogue is open in the meantime.
            </p>
            <div className="mt-8 flex justify-center">
              <EditorialLink href="/products">Browse all jewellery</EditorialLink>
            </div>
          </div>
        ) : (
          <>
            <p className="border-b pb-4 text-sm text-muted-foreground">
              {collections.length} {collections.length === 1 ? "collection" : "collections"}
            </p>
            {/* The same editorial tile as the homepage and the journal — the
                three surfaces that show a photograph with words under it now
                share one component. */}
            <RevealSection
              as="div"
              stagger
              className="mt-10 grid gap-x-6 gap-y-14 sm:grid-cols-2 lg:grid-cols-3"
            >
              {collections.map((collection, i) => (
                <CollectionCard key={collection.id} collection={collection} eager={i < 3} />
              ))}
            </RevealSection>
          </>
        )}
      </div>
    </div>
  );
}
