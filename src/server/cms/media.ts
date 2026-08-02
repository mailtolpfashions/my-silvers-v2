import { v2 as cloudinary } from "cloudinary";
import { prisma } from "@/server/db";
import { assertAllowedMediaUrls } from "@/server/media/url-allowlist";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function listMedia(params: { q?: string; folder?: string; page?: number }) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = 40;
  const where = {
    ...(params.folder ? { folder: params.folder } : {}),
    ...(params.q
      ? {
          OR: [
            { originalName: { contains: params.q, mode: "insensitive" as const } },
            { alt: { contains: params.q, mode: "insensitive" as const } },
            { tags: { has: params.q.toLowerCase() } },
          ],
        }
      : {}),
  };

  const [assets, total, folders] = await Promise.all([
    prisma.mediaAsset.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.mediaAsset.count({ where }),
    prisma.mediaAsset.groupBy({ by: ["folder"] }),
  ]);

  return { assets, total, page, pageSize, folders: folders.map((f) => f.folder).sort() };
}

/** Records an asset AFTER the client's signed direct-to-Cloudinary upload. */
export async function recordMediaAsset(input: {
  url: string;
  publicId: string;
  originalName: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  format?: string;
  folder?: string;
  uploadedById: string;
}) {
  assertAllowedMediaUrls([input.url], "Media");
  return prisma.mediaAsset.create({
    data: {
      url: input.url,
      filename: input.publicId,
      originalName: input.originalName,
      mimeType: input.mimeType,
      size: input.size,
      width: input.width ?? null,
      height: input.height ?? null,
      format: input.format ?? null,
      folder: input.folder ?? "cms",
      uploadedById: input.uploadedById,
    },
  });
}

export async function updateMediaAsset(id: string, input: { alt?: string; tags?: string[] }) {
  return prisma.mediaAsset.update({
    where: { id },
    data: {
      ...(input.alt !== undefined ? { alt: input.alt } : {}),
      ...(input.tags !== undefined ? { tags: input.tags.map((t) => t.toLowerCase()) } : {}),
    },
  });
}

/** Cloudinary destroy is best-effort — a failed CDN delete never blocks the DB delete. */
export async function deleteMediaAssets(ids: string[]) {
  const assets = await prisma.mediaAsset.findMany({ where: { id: { in: ids.slice(0, 50) } } });
  for (const asset of assets) {
    try {
      const resourceType = asset.mimeType.startsWith("video/") ? "video" : "image";
      await cloudinary.uploader.destroy(asset.filename, { resource_type: resourceType });
    } catch (err) {
      console.error("cloudinary destroy failed", asset.filename, err);
    }
  }
  await prisma.mediaAsset.deleteMany({ where: { id: { in: assets.map((a) => a.id) } } });
  return assets.length;
}
