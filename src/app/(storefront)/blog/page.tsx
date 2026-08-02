import Link from "next/link";
import Image from "next/image";
import { listPublishedEntries } from "@/server/cms/entries";

export const metadata = { title: "Blog — MY Silvers" };

export default async function BlogListPage() {
  const posts = await listPublishedEntries("blog");

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="mb-8 text-2xl font-semibold">From the journal</h1>

      {posts.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">No posts yet — check back soon.</p>
      ) : (
        <div className="grid gap-8 sm:grid-cols-2">
          {posts.map((post) => {
            const d = post.data as {
              title?: string;
              excerpt?: string;
              coverImage?: string;
              author?: string;
            };
            return (
              <Link key={post.id} href={`/blog/${post.slug}`} className="group block">
                <div className="relative aspect-[16/10] overflow-hidden rounded-lg bg-muted">
                  {d.coverImage && (
                    <Image
                      src={d.coverImage}
                      alt={d.title ?? ""}
                      fill
                      className="object-cover transition-transform group-hover:scale-105"
                      sizes="(max-width: 640px) 100vw, 50vw"
                    />
                  )}
                </div>
                <h2 className="mt-3 font-medium group-hover:underline">{d.title ?? post.slug}</h2>
                {d.excerpt && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{d.excerpt}</p>
                )}
                {d.author && <p className="mt-2 text-xs text-muted-foreground">By {d.author}</p>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
