import { NextRequest } from "next/server";
import { auth } from "@/server/auth/auth";
import { listMedia } from "@/server/cms/media";

/** Media listing for the library grid and the picker modal (editor-or-admin). */
export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "admin" && role !== "editor") {
    return new Response("Forbidden", { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const result = await listMedia({
    q: sp.get("q") ?? undefined,
    folder: sp.get("folder") ?? undefined,
    page: sp.get("page") ? Number(sp.get("page")) || 1 : 1,
  });

  return Response.json({
    ...result,
    assets: result.assets.map((a) => ({
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
    })),
  });
}
