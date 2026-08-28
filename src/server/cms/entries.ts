import { cacheLife, cacheTag } from "next/cache";
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
  // Returned so the calling action can invalidate the per-slug cache tag.
  return { slug: entry.slug };
}

/** Admin-only. Reverts status; publishedData is retained for reference. */
export async function unpublishEntry(entryId: string, userId: string) {
  const entry = await prisma.contentEntry.update({
    where: { id: entryId },
    data: { status: "draft", updatedById: userId },
  });
  return { slug: entry.slug };
}

/** Admin-only. */
export async function deleteEntry(entryId: string) {
  const entry = await prisma.contentEntry.delete({ where: { id: entryId } });
  return { slug: entry.slug };
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

/**
 * Sortable columns for the entry list, as an allowlist — the key arrives from
 * the query string and must never reach orderBy directly.
 *
 * ⚠️  Title is deliberately absent. It lives inside the `data` JSON blob (see
 * entryTitle), and Prisma cannot order by a JSON path — so the only honest
 * options were to sort by `slug` while labelling the column "Title", which
 * misorders visibly the moment the two diverge ("The Gifting Guide" →
 * "gifting-guide-silver"), or to sort the twenty rows of the current page in
 * the browser, which is not sorting the list at all. Both are worse than the
 * column simply not offering it. Ordering by title needs a real column.
 */
export const ENTRY_SORTS = {
  slug: (dir: "asc" | "desc") => ({ slug: dir }),
  status: (dir: "asc" | "desc") => ({ status: dir }),
  updated: (dir: "asc" | "desc") => ({ updatedAt: dir }),
} as const;

export type EntrySortKey = keyof typeof ENTRY_SORTS;

export function isEntrySortKey(value: unknown): value is EntrySortKey {
  return typeof value === "string" && value in ENTRY_SORTS;
}

export async function listEntries(params: {
  typeName: string;
  status?: "draft" | "published" | "archived";
  q?: string;
  page?: number;
  sort?: EntrySortKey;
  dir?: "asc" | "desc";
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
      orderBy: ENTRY_SORTS[params.sort ?? "updated"](params.dir ?? "desc"),
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

/**
 * Cached per (type, slug). Invalidated from src/actions/cms-actions.ts when an
 * entry is published, unpublished, deleted or rolled back — see the tag names
 * used there. Without that wiring an editor's publish would not appear until
 * the entry expired, which is the failure that erodes trust in a CMS fastest.
 */
export async function getPublishedEntry(typeName: string, slug?: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(`cms:${typeName}`);
  if (slug) cacheTag(`cms:${typeName}:${slug}`);

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
    // When the entry was last touched, as distinct from when it first went
    // live. Answer engines weigh freshness, so a post that has been corrected
    // or expanded should say so — see ArticleJsonLd's dateModified.
    updatedAt: entry.updatedAt,
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
  "use cache";
  cacheLife("hours");
  cacheTag(`cms:${typeName}`);

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
      updatedAt: e.updatedAt,
    }));
}
