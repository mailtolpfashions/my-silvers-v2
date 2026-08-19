import { listPublishedEntries } from "@/server/cms/entries";
import { EditorialTile } from "@/components/storefront/editorial-tile";
import { PageHeader } from "@/components/storefront/page-header";
import { EditorialLink } from "@/components/storefront/editorial-link";
import { BreadcrumbJsonLd } from "@/components/storefront/structured-data";
import { RevealSection } from "@/components/storefront/reveal-section";

export const metadata = { title: "Journal" };

/**
 * The journal index.
 *
 * Two columns of large landscape tiles rather than four small cards: these are
 * articles, and a grid of thumbnails reads as a blog widget bolted to a shop.
 * The serif appears here and in the post itself — the journal is the one place
 * on the site that is writing rather than interface.
 */
export default async function BlogListPage() {
  const posts = await listPublishedEntries("blog");

  return (
    <div>
      <BreadcrumbJsonLd trail={[{ name: "Journal", path: "/blog" }]} />

      <PageHeader
        eyebrow="Journal"
        title="Notes on silver"
        description="Care, craft and how to wear it — written by the people who make it."
      />

      <div className="container-page pt-10 rhythm-commerce-bottom">
        {posts.length === 0 ? (
          <div className="border-t rhythm-commerce text-center">
            <p className="text-h3">Nothing published yet</p>
            <p className="mt-3 text-sm text-muted-foreground">
              The first piece is on its way.
            </p>
            <div className="mt-8 flex justify-center">
              <EditorialLink href="/products">Browse all jewellery</EditorialLink>
            </div>
          </div>
        ) : (
          <RevealSection as="div" stagger className="grid gap-x-10 gap-y-14 sm:grid-cols-2">
            {posts.map((post, i) => {
              const d = post.data as {
                title?: string;
                excerpt?: string;
                coverImage?: string;
                author?: string;
              };
              return (
                <EditorialTile
                  key={post.id}
                  href={`/blog/${post.slug}`}
                  image={d.coverImage}
                  title={d.title ?? post.slug}
                  eyebrow={d.author ? `By ${d.author}` : undefined}
                  description={d.excerpt}
                  linkLabel="Read more"
                  ratio="landscape"
                  headingLevel="h2"
                  eager={i < 2}
                  sizes="(max-width: 640px) 100vw, 50vw"
                />
              );
            })}
          </RevealSection>
        )}
      </div>
    </div>
  );
}
