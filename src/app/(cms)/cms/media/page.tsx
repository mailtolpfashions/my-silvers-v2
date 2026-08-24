import { listMedia } from "@/server/cms/media";
import { MediaLibrary } from "@/components/cms/media-library";
import { PageHeader } from "@/components/layout/page-header";

/**
 * A deliberately blocking route.
 *
 * `cacheComponents` requires runtime data — the session, params, cookies — to
 * sit behind a <Suspense> boundary, or the route cannot prerender a shell. On
 * the storefront that matters and those pages stream. Here it does not, and
 * saying so explicitly is more honest than wrapping a dashboard in skeletons
 * to satisfy a validator:
 *
 *   - everything on this page is per-shopkeeper and behind a login, so there
 *     is no shell worth prerendering and nothing to share between visitors;
 *   - it is opened a handful of times a day by staff, not by shoppers, so no
 *     conversion and no crawl budget rides on it;
 *   - the data IS the page. A skeleton would be replaced wholesale a moment
 *     later, which is a flicker rather than a head start.
 *
 * This is what the error's own `[block]` remedy is for. It does not change how
 * the route renders; it records that blocking is the intended behaviour.
 */
export const instant = false;

type SearchParams = Promise<{ q?: string; folder?: string; page?: string }>;

export default async function MediaLibraryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const { assets, total, folders } = await listMedia({
    q: sp.q,
    folder: sp.folder,
    page: sp.page ? Number(sp.page) || 1 : 1,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Media library"
        description="Every image uploaded to the Studio. Pick from here rather than re-uploading — the same file used twice is one asset, not two."
      />
      <MediaLibrary
        assets={assets.map((a) => ({
          id: a.id,
          url: a.url,
          originalName: a.originalName,
          mimeType: a.mimeType,
          width: a.width,
          height: a.height,
          size: a.size,
          alt: a.alt,
          tags: a.tags,
          folder: a.folder,
          createdAt: a.createdAt.toISOString(),
        }))}
        folders={folders}
        total={total}
        currentFolder={sp.folder}
        currentQuery={sp.q}
      />
    </div>
  );
}
