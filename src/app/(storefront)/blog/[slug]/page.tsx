import { Suspense } from "react";
import { notFound } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";
import { getPublishedEntry } from "@/server/cms/entries";
import { RichText } from "@/components/storefront/cms/rich-text";
import { Skeleton } from "@/components/ui/skeleton";
import { ArticleJsonLd } from "@/components/storefront/structured-data";
import { EditorialLink } from "@/components/storefront/editorial-link";

type Params = Promise<{ slug: string }>;

/** No generateStaticParams — see the note in collections/[slug]/page.tsx. */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedEntry("blog", slug);
  if (!post) return { title: "Not found", robots: { index: false, follow: false } };
  const d = post.data as { title?: string; excerpt?: string };
  return {
    title: post.seo.metaTitle ?? d.title,
    description: post.seo.metaDescription ?? d.excerpt,
    ...(post.seo.noIndex ? { robots: { index: false } } : {}),
    ...(post.seo.canonicalUrl ? { alternates: { canonical: post.seo.canonicalUrl } } : {}),
    ...(post.seo.ogImage ? { openGraph: { images: [post.seo.ogImage] } } : {}),
  };
}

export default function BlogPostPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<BlogPostSkeleton />}>
      <BlogPostBody params={params} />
    </Suspense>
  );
}

function BlogPostSkeleton() {
  return (
    <div className="container-prose rhythm-commerce">
      <Skeleton className="h-9 w-3/4" />
      <Skeleton className="mt-3 h-4 w-48" />
      <Skeleton className="mt-8 aspect-[16/9] w-full" />
      <div className="mt-8 space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}

async function BlogPostBody({ params }: { params: Params }) {
  const { slug } = await params;
  const post = await getPublishedEntry("blog", slug);
  if (!post) notFound();

  const d = post.data as {
    title?: string;
    author?: string;
    excerpt?: string;
    body?: string;
    coverImage?: string;
    publishedAt?: string;
  };

  return (
    <>
      <ArticleJsonLd
        title={d.title ?? post.slug}
        slug={post.slug}
        excerpt={d.excerpt}
        image={d.coverImage}
        author={d.author}
        publishedAt={(d.publishedAt ? new Date(d.publishedAt) : post.publishedAt)?.toISOString()}
        modifiedAt={post.updatedAt?.toISOString()}
      />

      <article className="container-prose rhythm-commerce">
        <p className="label-eyebrow mb-4">Journal</p>
        {/* The serif, on purpose. The journal is the one place on the site that
            is writing rather than interface, and it is what Playfair is loaded
            for — see the note in story-section.tsx. */}
        <h1 className="font-serif text-h1 leading-tight">{d.title}</h1>
        <p className="mt-4 border-b pb-6 text-sm text-muted-foreground">
          {d.author && <>By {d.author} · </>}
          {(d.publishedAt ? new Date(d.publishedAt) : post.publishedAt)?.toLocaleDateString(
            "en-IN",
            { dateStyle: "long" }
          )}
        </p>
        {d.coverImage && (
          <div className="relative mt-8 aspect-[16/9] overflow-hidden bg-muted">
            <Image
              src={d.coverImage}
              alt={d.title ?? ""}
              fill
              sizes="(max-width: 768px) 100vw, 42rem"
              className="object-cover"
              loading="eager"
              fetchPriority="high"
            />
          </div>
        )}
        {d.body && (
          <RichText
            html={d.body}
            className="mt-10 prose-headings:font-serif prose-headings:font-medium"
          />
        )}

        <div className="mt-14 border-t pt-8">
          <EditorialLink href="/blog">All journal entries</EditorialLink>
        </div>
      </article>
    </>
  );
}
