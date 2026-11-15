"use server";

import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { requireOwner, requireRole } from "@/server/auth/require-role";
import { logActivity } from "@/server/activity/log";
import {
  saveEntry,
  publishEntry,
  unpublishEntry,
  deleteEntry,
  restoreVersion,
  restoreDefaultHomepage,
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

/**
 * Drops the cached reads for one content type.
 *
 * These MUST be tags, not paths: the storefront's CMS reads are cached with
 * cacheTag(`cms:<type>`) in src/server/cms/entries.ts, and revalidatePath does
 * not touch cacheTag entries. Publishing and not seeing the change is the
 * failure that erodes trust in a CMS fastest — if you add a cached CMS read,
 * add its tag here in the same commit.
 *
 * updateTag (not revalidateTag) because this runs in a Server Action: the
 * editor who just hit Publish must see the result immediately, not eventually.
 */
function revalidateForType(typeName: string, slug?: string | null) {
  updateTag(`cms:${typeName}`);
  if (slug) updateTag(`cms:${typeName}:${slug}`);

  // The announcement bar renders on every storefront page from its own tag.
  if (typeName === "announcement") updateTag("cms:announcement");
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
    const { slug } = await publishEntry(entryId, session.user.id);
    await logActivity(session, {
      action: "cms.publish",
      target: { type: typeName, id: entryId },
      summary: `Published ${typeName} “${slug}”`,
    });
    revalidatePath(`/cms/content/${typeName}`);
    revalidateForType(typeName, slug);
    return { ok: true };
  } catch (err) {
    if (err instanceof CmsError) return { ok: false, error: err.message };
    console.error("publishEntryAction failed", err);
    return { ok: false, error: "Could not publish the entry." };
  }
}

/** Owner-only — destructive-tier action per the RBAC model (see roles.ts). */
export async function unpublishEntryAction(
  entryId: string,
  typeName: string
): Promise<CmsActionResult> {
  const session = await requireOwner();
  try {
    const { slug } = await unpublishEntry(entryId, session.user.id);
    await logActivity(session, {
      action: "cms.unpublish",
      target: { type: typeName, id: entryId },
      summary: `Unpublished ${typeName} “${slug}”`,
    });
    revalidatePath(`/cms/content/${typeName}`);
    revalidateForType(typeName, slug);
    return { ok: true };
  } catch (err) {
    // CmsError carries the refusal for the homepage — say it, don't crash.
    if (err instanceof CmsError) return { ok: false, error: err.message };
    throw err;
  }
}

/** Owner-only. */
export async function deleteEntryAction(
  entryId: string,
  typeName: string
): Promise<CmsActionResult> {
  const session = await requireOwner();
  try {
    const { slug } = await deleteEntry(entryId);
    await logActivity(session, {
      action: "cms.delete",
      target: { type: typeName, id: entryId },
      summary: `Deleted ${typeName} “${slug}”`,
    });
    revalidatePath(`/cms/content/${typeName}`);
    revalidateForType(typeName, slug);
    return { ok: true };
  } catch (err) {
    if (err instanceof CmsError) return { ok: false, error: err.message };
    throw err;
  }
}

/** Owner-only. Puts a deleted homepage back — see restoreDefaultHomepage. */
export async function restoreHomepageAction(): Promise<CmsActionResult> {
  const session = await requireOwner();
  try {
    const { slug } = await restoreDefaultHomepage(session.user.id);
    await logActivity(session, {
      action: "cms.restore",
      target: { type: "homepage" },
      summary: "Restored the default homepage",
    });
    revalidatePath("/cms/content/homepage");
    revalidatePath("/");
    revalidateForType("homepage", slug);
    return { ok: true };
  } catch (err) {
    if (err instanceof CmsError) return { ok: false, error: err.message };
    console.error("restoreHomepageAction failed", err);
    return { ok: false, error: "Could not restore the homepage. Please try again." };
  }
}

/** Admin-only. */
export async function restoreVersionAction(
  entryId: string,
  versionId: string,
  typeName: string
): Promise<CmsActionResult> {
  const session = await requireOwner();
  try {
    await restoreVersion(entryId, versionId, session.user.id);
    await logActivity(session, {
      action: "cms.restore",
      target: { type: typeName, id: entryId },
      summary: `Restored an earlier version of a ${typeName} entry`,
    });
    revalidatePath(`/cms/content/${typeName}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof CmsError) return { ok: false, error: err.message };
    return { ok: false, error: "Could not restore this version." };
  }
}

// ─── Media (editor-or-admin; delete is the owner's — see roles.ts) ──────────

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
  // Owner-only, like every delete — a deleted image vanishes from every page
  // that used it. Editors and admins can still upload and re-tag.
  const session = await requireOwner();
  const deleted = await deleteMediaAssets(ids);
  await logActivity(session, {
    action: "cms.media.delete",
    target: { type: "media" },
    summary: `Deleted ${ids.length} image${ids.length === 1 ? "" : "s"} from the media library`,
    details: { ids },
  });
  revalidatePath("/cms/media");
  return { ok: true as const, deleted };
}
