import { prisma } from "@/server/db";
import type { Prisma, ContentEntry } from "@/generated/prisma/client";
import { slugify } from "@/server/products/admin";
import { sanitizeEntryData } from "@/server/cms/sanitize";
import { parseFields, type EntryData, type SeoInput } from "@/server/cms/types";

const MAX_VERSIONS = 15;

export class CmsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CmsError";
  }
}

export async function getContentType(name: string) {
  const type = await prisma.contentType.findUnique({ where: { name } });
  if (!type) throw new CmsError(`Unknown content type "${name}".`);
  return type;
}

export async function listContentTypes() {
  return prisma.contentType.findMany({ orderBy: { name: "asc" } });
}

// ─── Version history ────────────────────────────────────────────────────────

/** Snapshot the entry's PRE-change data; trim to the newest MAX_VERSIONS. */
async function pushVersion(
  tx: Prisma.TransactionClient,
  entry: ContentEntry,
  label?: string
) {
  const last = await tx.contentEntryVersion.findFirst({
    where: { entryId: entry.id },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  const versionNumber = (last?.versionNumber ?? 0) + 1;
  await tx.contentEntryVersion.create({
    data: {
      entryId: entry.id,
      versionNumber,
      data: entry.data as Prisma.InputJsonValue,
      status: entry.status,
      label: label ?? null,
      savedById: entry.updatedById,
    },
  });
  const cutoff = versionNumber - MAX_VERSIONS;
  if (cutoff > 0) {
    await tx.contentEntryVersion.deleteMany({
      where: { entryId: entry.id, versionNumber: { lte: cutoff } },
    });
  }
}

// ─── Slug handling ──────────────────────────────────────────────────────────

async function uniqueEntrySlug(
  contentTypeId: string,
  desired: string,
  excludeId?: string
): Promise<string> {
  const base = slugify(desired) || "entry";
  let slug = base;
  for (let n = 2; ; n++) {
    const existing = await prisma.contentEntry.findUnique({
      where: { contentTypeId_slug: { contentTypeId, slug } },
    });
    if (!existing || existing.id === excludeId) return slug;
    slug = `${base}-${n}`;
  }
}

function desiredSlugFrom(data: EntryData, typeName: string, isSingleton: boolean): string {
  if (isSingleton) return typeName;
  const explicit = data.slug;
  if (typeof explicit === "string" && explicit.trim()) return explicit;
  const title = data.title ?? data.name ?? data.text;
  if (typeof title === "string" && title.trim()) return title;
  return typeName;
}

// ─── Editorial operations ───────────────────────────────────────────────────

export async function saveEntry(input: {
  typeName: string;
  entryId: string | null;
  data: EntryData;
  seo: SeoInput;
  userId: string;
}): Promise<{ id: string }> {
  const type = await getContentType(input.typeName);
  const fields = parseFields(type.fields);
  const data = sanitizeEntryData(fields, input.data) as Prisma.InputJsonValue;

  const seoData = {
    seoMetaTitle: input.seo.metaTitle || null,
    seoMetaDescription: input.seo.metaDescription || null,
    seoOgImage: input.seo.ogImage || null,
    seoCanonicalUrl: input.seo.canonicalUrl || null,
    seoNoIndex: input.seo.noIndex ?? false,
  };

  // Singletons never duplicate — creating one that exists updates it instead.
  let entryId = input.entryId;
  if (!entryId && type.isSingleton) {
    const existing = await prisma.contentEntry.findFirst({
      where: { contentTypeId: type.id },
    });
    if (existing) entryId = existing.id;
  }

  if (entryId) {
    const entry = await prisma.contentEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new CmsError("Entry not found.");
    const slug = await uniqueEntrySlug(
      type.id,
      desiredSlugFrom(input.data, type.name, type.isSingleton),
      entry.id
    );
    await prisma.$transaction(async (tx) => {
      await pushVersion(tx, entry);
      await tx.contentEntry.update({
        where: { id: entry.id },
        data: { data, slug, updatedById: input.userId, ...seoData },
      });
    });
    return { id: entry.id };
  }

  const slug = await uniqueEntrySlug(
    type.id,
    desiredSlugFrom(input.data, type.name, type.isSingleton)
  );
  const created = await prisma.contentEntry.create({
    data: {
      contentTypeId: type.id,
      slug,
      status: "draft",
      data,
      createdById: input.userId,
      updatedById: input.userId,
      ...seoData,
    },
  });
  return { id: created.id };
}

/** Publish snapshots data → publishedData, decoupling live from draft edits. */
export async function publishEntry(entryId: string, userId: string) {
  const entry = await prisma.contentEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new CmsError("Entry not found.");
  await prisma.$transaction(async (tx) => {
    await pushVersion(tx, entry, "publish");
    await tx.contentEntry.update({
      where: { id: entryId },
      data: {
        publishedData: entry.data as Prisma.InputJsonValue,
        status: "published",
        publishedAt: new Date(),
        publishedById: userId,
        updatedById: userId,
      },
    });
  });
}

/** Admin-only. Reverts status; publishedData is retained for reference. */
export async function unpublishEntry(entryId: string, userId: string) {
  await prisma.contentEntry.update({
    where: { id: entryId },
    data: { status: "draft", updatedById: userId },
  });
}

/** Admin-only. */
export async function deleteEntry(entryId: string) {
  await prisma.contentEntry.delete({ where: { id: entryId } });
}

/** Admin-only. Restores a version's data as the working draft. */
export async function restoreVersion(entryId: string, versionId: string, userId: string) {
  const [entry, version] = await Promise.all([
    prisma.contentEntry.findUnique({ where: { id: entryId } }),
    prisma.contentEntryVersion.findUnique({ where: { id: versionId } }),
  ]);
  if (!entry || !version || version.entryId !== entryId) {
    throw new CmsError("Version not found.");
  }
  await prisma.$transaction(async (tx) => {
    await pushVersion(tx, entry, "pre-restore");
    await tx.contentEntry.update({
      where: { id: entryId },
      data: { data: version.data as Prisma.InputJsonValue, updatedById: userId },
    });
  });
}

// ─── Editorial queries ──────────────────────────────────────────────────────

export async function listEntries(params: {
  typeName: string;
  status?: "draft" | "published" | "archived";
  q?: string;
  page?: number;
}) {
  const type = await getContentType(params.typeName);
  const page = Math.max(1, params.page ?? 1);
  const pageSize = 20;

  const where: Prisma.ContentEntryWhereInput = {
    contentTypeId: type.id,
    ...(params.status ? { status: params.status } : {}),
    ...(params.q ? { slug: { contains: params.q, mode: "insensitive" } } : {}),
  };

  const [entries, total] = await Promise.all([
    prisma.contentEntry.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.contentEntry.count({ where }),
  ]);

  return { type, entries, total, page, pageSize };
}

export async function getEntryForEdit(entryId: string) {
  return prisma.contentEntry.findUnique({
    where: { id: entryId },
    include: {
      contentType: true,
      versions: { orderBy: { versionNumber: "desc" } },
    },
  });
}

export async function getSingletonEntry(typeName: string) {
  const type = await getContentType(typeName);
  return prisma.contentEntry.findFirst({ where: { contentTypeId: type.id } });
}

// ─── Public reads — THE only path the storefront may use ────────────────────
// Only publishedData of published entries is ever exposed; drafts never leak.

export async function getPublishedEntry(typeName: string, slug?: string) {
  const entry = await prisma.contentEntry.findFirst({
    where: {
      contentType: { name: typeName },
      status: "published",
      ...(slug ? { slug } : {}),
    },
    orderBy: { publishedAt: "desc" },
  });
  if (!entry || !entry.publishedData) return null;
  return {
    id: entry.id,
    slug: entry.slug,
    data: entry.publishedData as EntryData,
    publishedAt: entry.publishedAt,
    seo: {
      metaTitle: entry.seoMetaTitle,
      metaDescription: entry.seoMetaDescription,
      ogImage: entry.seoOgImage,
      canonicalUrl: entry.seoCanonicalUrl,
      noIndex: entry.seoNoIndex,
    },
  };
}

export async function listPublishedEntries(typeName: string, take = 50) {
  const entries = await prisma.contentEntry.findMany({
    where: { contentType: { name: typeName }, status: "published" },
    orderBy: { publishedAt: "desc" },
    take,
  });
  return entries
    .filter((e) => e.publishedData)
    .map((e) => ({
      id: e.id,
      slug: e.slug,
      data: e.publishedData as EntryData,
      publishedAt: e.publishedAt,
    }));
}
