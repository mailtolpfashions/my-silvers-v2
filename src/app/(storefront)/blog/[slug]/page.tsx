import { notFound } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";
import { getPublishedEntry } from "@/server/cms/entries";
import { RichText } from "@/components/storefront/cms/rich-text";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedEntry("blog", slug);
  if (!post) return {};
  const d = post.data as { title?: string; excerpt?: string };
  return {
    title: post.seo.metaTitle ?? d.title,
    description: post.seo.metaDescription ?? d.excerpt,
    ...(post.seo.noIndex ? { robots: { index: false } } : {}),
    ...(post.seo.canonicalUrl ? { alternates: { canonical: post.seo.canonicalUrl } } : {}),
    ...(post.seo.ogImage ? { openGraph: { images: [post.seo.ogImage] } } : {}),
  };
}

export default async function BlogPostPage({ params }: { params: Params }) {
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
    <article className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">{d.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {d.author && <>By {d.author} · </>}
        {(d.publishedAt ? new Date(d.publishedAt) : post.publishedAt)?.toLocaleDateString(
          "en-IN",
          { dateStyle: "long" }
        )}
      </p>
      {d.coverImage && (
        <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-lg">
          <Image src={d.coverImage} alt={d.title ?? ""} fill className="object-cover" priority />
        </div>
      )}
      {d.body && <RichText html={d.body} className="mt-8" />}
    </article>
  );
}
