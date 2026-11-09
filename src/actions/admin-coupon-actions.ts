"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require-role";
import { normaliseCode } from "@/server/coupons/coupons";

/** "" from an empty input means "no limit". */
const optionalNumber = z
  .union([z.number(), z.literal(""), z.null()])
  .transform((v) => (v === "" || v === null ? null : v));

/**
 * Dates arrive as yyyy-mm-dd from <input type="date"> and mean India's
 * calendar day: a coupon "ending 31 Dec" works until 23:59:59 IST that night,
 * not until 05:30 the next morning as a bare UTC date would.
 */
const optionalDay = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()])
  .transform((v) => (v ? v : null));

const couponSchema = z
  .object({
    code: z
      .string()
      .transform(normaliseCode)
      .pipe(
        z
          .string()
          .min(3, "Codes are at least 3 characters.")
          .max(20, "Keep codes to 20 characters.")
          .regex(/^[A-Z0-9_-]+$/, "Use letters, numbers, - and _ only."),
      ),
    description: z.string().trim().max(200).optional().or(z.literal("")),
    type: z.enum(["percent", "flat"]),
    value: z.number().positive("Enter the discount."),
    minOrderValue: optionalNumber.pipe(z.number().min(0).nullable()),
    maxDiscount: optionalNumber.pipe(z.number().positive().nullable()),
    startsOn: optionalDay,
    endsOn: optionalDay,
    usageLimit: optionalNumber.pipe(z.number().int().positive().nullable()),
    onePerCustomer: z.boolean(),
    firstOrderOnly: z.boolean(),
    active: z.boolean(),
  })
  .refine((c) => c.type !== "percent" || c.value <= 90, {
    message: "A percentage discount can be at most 90%.",
    path: ["value"],
  })
  .refine((c) => !c.startsOn || !c.endsOn || c.startsOn <= c.endsOn, {
    message: "The end date is before the start date.",
    path: ["endsOn"],
  });

export type CouponActionResult = { ok: true } | { ok: false; error: string };

export async function saveCouponAction(id: string | null, input: unknown): Promise<CouponActionResult> {
  await requireRole("admin");
  const parsed = couponSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the coupon." };
  }
  const c = parsed.data;

  const clash = await prisma.coupon.findUnique({ where: { code: c.code }, select: { id: true } });
  if (clash && clash.id !== id) return { ok: false, error: `“${c.code}” already exists.` };

  const data = {
    code: c.code,
    description: c.description || null,
    type: c.type,
    value: c.value.toFixed(2),
    minOrderValue: c.minOrderValue === null ? null : c.minOrderValue.toFixed(2),
    // A cap only means something on a percentage.
    maxDiscount: c.type === "percent" && c.maxDiscount !== null ? c.maxDiscount.toFixed(2) : null,
    startsAt: c.startsOn ? new Date(`${c.startsOn}T00:00:00+05:30`) : null,
    endsAt: c.endsOn ? new Date(`${c.endsOn}T23:59:59.999+05:30`) : null,
    usageLimit: c.usageLimit,
    onePerCustomer: c.onePerCustomer,
    firstOrderOnly: c.firstOrderOnly,
    active: c.active,
  };

  if (id) await prisma.coupon.update({ where: { id }, data });
  else await prisma.coupon.create({ data });

  revalidatePath("/admin/coupons");
  return { ok: true };
}

export async function setCouponActiveAction(id: string, active: boolean): Promise<CouponActionResult> {
  await requireRole("admin");
  await prisma.coupon.update({ where: { id }, data: { active } });
  revalidatePath("/admin/coupons");
  return { ok: true };
}

/**
 * Deleting keeps every order that used the code intact — they hold couponCode
 * as text, and the link is SET NULL. Switching off is usually what you want;
 * delete is for a code created by mistake.
 */
export async function deleteCouponAction(id: string): Promise<CouponActionResult> {
  await requireRole("admin");
  await prisma.coupon.delete({ where: { id } });
  revalidatePath("/admin/coupons");
  return { ok: true };
}
