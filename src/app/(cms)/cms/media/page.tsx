import { listMedia } from "@/server/cms/media";
import { MediaLibrary } from "@/components/cms/media-library";

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
      <h1 className="text-h2 font-semibold">Media library</h1>
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
