"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth/require-role";
import {
  saveEntry,
  publishEntry,
  unpublishEntry,
  deleteEntry,
  restoreVersion,
  CmsError,
} from "@/server/cms/entries";
import {
  recordMediaAsset,
  updateMediaAsset,
  deleteMediaAssets,
} from "@/server/cms/media";

export type CmsActionResult =
  | { ok: true; entryId?: string }
  | { ok: false; error: string };

const seoSchema = z.object({
  metaTitle: z.string().max(200).optional().or(z.literal("")),
  metaDescription: z.string().max(500).optional().or(z.literal("")),
  ogImage: z.string().url().optional().or(z.literal("")),
  canonicalUrl: z.string().url().optional().or(z.literal("")),
  noIndex: z.boolean().optional(),
});

const saveSchema = z.object({
  typeName: z.string().min(1),
  entryId: z.string().nullable(),
  data: z.record(z.string(), z.unknown()),
  seo: seoSchema,
});

/** Content-type slug → the storefront paths that render it. */
function revalidateForType(typeName: string) {
  revalidatePath("/");
  switch (typeName) {
    case "blog":
      revalidatePath("/blog", "layout");
      break;
    case "page":
      revalidatePath("/p", "layout");
      break;
    case "collection":
      revalidatePath("/collections", "layout");
      break;
  }
}

export async function saveEntryAction(input: unknown): Promise<CmsActionResult> {
  const session = await requireRole("admin", "editor");
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid entry data." };

  try {
    const { id } = await saveEntry({
      typeName: parsed.data.typeName,
      entryId: parsed.data.entryId,
      data: parsed.data.data,
      seo: {
        metaTitle: parsed.data.seo.metaTitle || undefined,
        metaDescription: parsed.data.seo.metaDescription || undefined,
        ogImage: parsed.data.seo.ogImage || undefined,
        canonicalUrl: parsed.data.seo.canonicalUrl || undefined,
        noIndex: parsed.data.seo.noIndex,
      },
      userId: session.user.id,
    });
    revalidatePath(`/cms/content/${parsed.data.typeName}`);
    return { ok: true, entryId: id };
  } catch (err) {
    if (err instanceof CmsError) return { ok: false, error: err.message };
    console.error("saveEntryAction failed", err);
    return { ok: false, error: "Could not save the entry." };
  }
}

export async function publishEntryAction(
  entryId: string,
  typeName: string
): Promise<CmsActionResult> {
  const session = await requireRole("admin", "editor");
  try {
    await publishEntry(entryId, session.user.id);
    revalidatePath(`/cms/content/${typeName}`);
    revalidateForType(typeName);
    return { ok: true };
  } catch (err) {
    if (err instanceof CmsError) return { ok: false, error: err.message };
    console.error("publishEntryAction failed", err);
    return { ok: false, error: "Could not publish the entry." };
  }
}

/** Admin-only — destructive-tier action per the RBAC model. */
export async function unpublishEntryAction(
  entryId: string,
  typeName: string
): Promise<CmsActionResult> {
  const session = await requireRole("admin");
  await unpublishEntry(entryId, session.user.id);
  revalidatePath(`/cms/content/${typeName}`);
  revalidateForType(typeName);
  return { ok: true };
}

/** Admin-only. */
export async function deleteEntryAction(
  entryId: string,
  typeName: string
): Promise<CmsActionResult> {
  await requireRole("admin");
  await deleteEntry(entryId);
  revalidatePath(`/cms/content/${typeName}`);
  revalidateForType(typeName);
  return { ok: true };
}

/** Admin-only. */
export async function restoreVersionAction(
  entryId: string,
  versionId: string,
  typeName: string
): Promise<CmsActionResult> {
  const session = await requireRole("admin");
  try {
    await restoreVersion(entryId, versionId, session.user.id);
    revalidatePath(`/cms/content/${typeName}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof CmsError) return { ok: false, error: err.message };
    return { ok: false, error: "Could not restore this version." };
  }
}

// ─── Media (editor-or-admin including delete — parity with the old system) ──

const recordMediaSchema = z.object({
  url: z.string().url(),
  publicId: z.string().min(1),
  originalName: z.string().min(1).max(300),
  mimeType: z.string().min(1).max(100),
  size: z.number().int().min(0),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  format: z.string().max(20).optional(),
  folder: z.string().max(100).optional(),
});

export async function recordMediaAssetAction(input: unknown) {
  const session = await requireRole("admin", "editor");
  const parsed = recordMediaSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid media data." };
  try {
    const asset = await recordMediaAsset({ ...parsed.data, uploadedById: session.user.id });
    revalidatePath("/cms/media");
    return { ok: true as const, asset: { id: asset.id, url: asset.url } };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Could not save the media record.",
    };
  }
}

export async function updateMediaAssetAction(
  id: string,
  input: { alt?: string; tags?: string[] }
) {
  await requireRole("admin", "editor");
  await updateMediaAsset(id, input);
  revalidatePath("/cms/media");
  return { ok: true as const };
}

export async function deleteMediaAssetsAction(ids: string[]) {
  await requireRole("admin", "editor");
  const deleted = await deleteMediaAssets(ids);
  revalidatePath("/cms/media");
  return { ok: true as const, deleted };
}
