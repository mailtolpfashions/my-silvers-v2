"use server";

import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require-role";
import { assertAllowedMediaUrls } from "@/server/media/url-allowlist";
import { slugify } from "@/server/products/admin";

const categorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  image: z.string().url().optional().or(z.literal("")),
  sortOrder: z.number().int().min(0).max(9999),
  isActive: z.boolean(),
});

export type CategoryActionResult = { ok: true } | { ok: false; error: string };

async function uniqueCategorySlug(name: string, excludeId?: string): Promise<string | null> {
  const slug = slugify(name);
  if (!slug) return null;
  // Duplicate-slug guard across active AND inactive rows.
  const existing = await prisma.category.findUnique({ where: { slug } });
  if (existing && existing.id !== excludeId) return null;
  return slug;
}

export async function saveCategoryAction(
  id: string | null,
  input: unknown
): Promise<CategoryActionResult> {
  await requireRole("admin");
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid category data." };
  }
  const data = parsed.data;

  try {
    if (data.image) assertAllowedMediaUrls([data.image], "Category image");

    const slug = await uniqueCategorySlug(data.name, id ?? undefined);
    if (!slug) return { ok: false, error: "A category with this name already exists." };

    const payload = {
      name: data.name,
      slug,
      description: data.description || null,
      image: data.image || null,
      sortOrder: data.sortOrder,
      isActive: data.isActive,
    };

    if (id) {
      await prisma.category.update({ where: { id }, data: payload });
    } else {
      await prisma.category.create({ data: payload });
    }

    revalidatePath("/admin/categories");
    updateTag("categories");
    updateTag("products");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to save category." };
  }
}

export async function setCategoryActiveAction(id: string, isActive: boolean): Promise<CategoryActionResult> {
  await requireRole("admin");
  await prisma.category.update({ where: { id }, data: { isActive } });
  revalidatePath("/admin/categories");
  updateTag("categories");
  updateTag("products");
  return { ok: true };
}
