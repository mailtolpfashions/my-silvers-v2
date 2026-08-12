import { listMedia } from "@/server/cms/media";
import { MediaLibrary } from "@/components/cms/media-library";
import { PageHeader } from "@/components/layout/page-header";

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
