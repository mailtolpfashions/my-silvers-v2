"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth/require-role";
import {
  createProduct,
  updateProduct,
  archiveProduct,
  restoreProduct,
  bulkImportProducts,
  type CsvRow,
} from "@/server/products/admin";

const productSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  shortDescription: z.string().trim().max(500).optional().or(z.literal("")),
  price: z.number().min(0),
  compareAtPrice: z.number().min(0).nullable().optional(),
  images: z.array(z.string().url()).max(6),
  videoUrl: z.string().url().nullable().optional().or(z.literal("")),
  categoryId: z.string().min(1),
  weight: z.number().min(0).nullable().optional(),
  purity: z.string().trim().max(100).optional().or(z.literal("")),
  dimensions: z.string().trim().max(200).optional().or(z.literal("")),
  sizes: z.array(z.string().trim().min(1)).max(30),
  material: z.string().trim().max(200).optional().or(z.literal("")),
  stock: z.number().int().min(0),
  sku: z.string().trim().min(1).max(100),
  isFeatured: z.boolean(),
  isBestseller: z.boolean(),
  isActive: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1)).max(30),
});

export type AdminActionResult = { ok: true } | { ok: false; error: string };

function toInput(data: z.infer<typeof productSchema>) {
  return {
    ...data,
    description: data.description || undefined,
    shortDescription: data.shortDescription || undefined,
    purity: data.purity || undefined,
    dimensions: data.dimensions || undefined,
    material: data.material || undefined,
    videoUrl: data.videoUrl || null,
    compareAtPrice: data.compareAtPrice ?? null,
    weight: data.weight ?? null,
  };
}

export async function createProductAction(input: unknown): Promise<AdminActionResult> {
  await requireRole("admin");
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid product data." };
  }
  try {
    await createProduct(toInput(parsed.data));
    revalidatePath("/admin/products");
    revalidatePath("/products");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to create product." };
  }
}

export async function updateProductAction(id: string, input: unknown): Promise<AdminActionResult> {
  await requireRole("admin");
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid product data." };
  }
  try {
    await updateProduct(id, toInput(parsed.data));
    revalidatePath("/admin/products");
    revalidatePath("/products");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to update product." };
  }
}

export async function archiveProductAction(id: string): Promise<AdminActionResult> {
  await requireRole("admin");
  await archiveProduct(id);
  revalidatePath("/admin/products");
  revalidatePath("/products");
  return { ok: true };
}

export async function restoreProductAction(id: string): Promise<AdminActionResult> {
  await requireRole("admin");
  await restoreProduct(id);
  revalidatePath("/admin/products");
  revalidatePath("/products");
  return { ok: true };
}

export async function bulkImportProductsAction(rows: CsvRow[]) {
  await requireRole("admin");
  const result = await bulkImportProducts(rows);
  revalidatePath("/admin/products");
  revalidatePath("/products");
  return result;
}
