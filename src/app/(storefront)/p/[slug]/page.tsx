import { Suspense } from "react";
import { notFound } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";
import { getPublishedEntry } from "@/server/cms/entries";
import { RichText } from "@/components/storefront/cms/rich-text";
import { Skeleton } from "@/components/ui/skeleton";

type Params = Promise<{ slug: string }>;

/** No generateStaticParams — see the note in collections/[slug]/page.tsx. */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPublishedEntry("page", slug);
  if (!page) return { title: "Not found", robots: { index: false, follow: false } };
  const d = page.data as { title?: string; excerpt?: string };
  return {
    title: page.seo.metaTitle ?? d.title,
    description: page.seo.metaDescription ?? d.excerpt,
    ...(page.seo.noIndex ? { robots: { index: false } } : {}),
  };
}

/** Generic CMS "page" entries — about, shipping policy, FAQs, etc. */
export default function CmsPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<CmsPageSkeleton />}>
      <CmsPageBody params={params} />
    </Suspense>
  );
}

function CmsPageSkeleton() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="mt-3 h-4 w-full max-w-md" />
      <div className="mt-8 space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
}

async function CmsPageBody({ params }: { params: Params }) {
  const { slug } = await params;
  const page = await getPublishedEntry("page", slug);
  if (!page) notFound();

  const d = page.data as {
    title?: string;
    excerpt?: string;
    content?: string;
    coverImage?: string;
  };

  return (
    <article className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">{d.title}</h1>
      {d.excerpt && <p className="mt-2 text-muted-foreground">{d.excerpt}</p>}
      {d.coverImage && (
        <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-lg">
          <Image src={d.coverImage} alt={d.title ?? ""} fill className="object-cover" />
        </div>
      )}
      {d.content && <RichText html={d.content} className="mt-8" />}
    </article>
  );
}
