import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { getPublishedEntry } from "@/server/cms/entries";
import { RichText } from "@/components/storefront/cms/rich-text";
import { Button } from "@/components/ui/button";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getPublishedEntry("collection", slug);
  if (!collection) return {};
  const d = collection.data as { title?: string; description?: string };
  return {
    title: collection.seo.metaTitle ?? d.title,
    description: collection.seo.metaDescription ?? d.description,
  };
}

/** Themed collection landing pages (bridal, daily wear, festive…). */
export default async function CollectionPage({ params }: { params: Params }) {
  const { slug } = await params;
  const collection = await getPublishedEntry("collection", slug);
  if (!collection) notFound();

  const d = collection.data as {
    title?: string;
    eyebrow?: string;
    description?: string;
    story?: string;
    heroImage?: string;
    cta?: string;
  };

  return (
    <div>
      <section className="relative">
        {d.heroImage && (
          <div className="relative aspect-[21/9] w-full overflow-hidden bg-muted">
            <Image src={d.heroImage} alt={d.title ?? ""} fill className="object-cover" priority />
          </div>
        )}
        <div className="mx-auto max-w-3xl px-4 py-12 text-center">
          {d.eyebrow && (
            <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
              {d.eyebrow}
            </p>
          )}
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{d.title}</h1>
          {d.description && <p className="mt-4 text-muted-foreground">{d.description}</p>}
          <Button asChild size="lg" className="mt-6">
            <Link href="/products">{d.cta || "Shop now"}</Link>
          </Button>
        </div>
      </section>

      {d.story && (
        <section className="mx-auto max-w-2xl px-4 pb-16">
          <RichText html={d.story} />
        </section>
      )}
    </div>
  );
}
