"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { requireOwner } from "@/server/auth/require-role";
import { logActivity } from "@/server/activity/log";
import { rupees, days } from "@/lib/validation/settings";
import {
  getStoreSettings,
  saveStoreSettings,
  STORE_SETTINGS_TAG,
  type StoreSettings,
} from "@/server/settings/store-settings";
import { saveCourierConfig } from "@/server/settings/courier-config";
import {
  NimbusPostError,
  sendNimbusPostWarehouseOtp,
  verifyNimbusPostWarehouseOtp,
  createNimbusPostWarehouse,
  createNimbusPostWebhook,
} from "@/server/integrations/nimbuspost";
import { resolveAppBaseUrl } from "@/server/email/resend";

/**
 * The Courier page (/admin/courier) — owner only, like Settings, because
 * everything here either changes what shoppers are charged and promised, or
 * spends the shop's courier wallet.
 */

export type CourierActionResult = { ok: true } | { ok: false; error: string };

const courierSchema = z
  .object({
    courierPartners: z.object({ shiprocket: z.boolean(), nimbuspost: z.boolean() }),
    shippingCharge: rupees,
    freeShippingThreshold: rupees,
    handlingTimeMinDays: days,
    handlingTimeMaxDays: days,
    transitTimeMinDays: days,
    transitTimeMaxDays: days,
  })
  .refine((v) => v.courierPartners.shiprocket || v.courierPartners.nimbuspost, {
    message: "Courier partners: keep at least one switched on, or no order can be shipped.",
  })
  /**
   * A range whose maximum is below its minimum is not a slow estimate, it is a
   * typo — and one that structured data would publish as an impossible delivery
   * window. Refused rather than silently swapped, so the mistake stays visible.
   */
  .refine((v) => v.handlingTimeMaxDays >= v.handlingTimeMinDays, {
    message: "Dispatch: the maximum cannot be less than the minimum.",
  })
  .refine((v) => v.transitTimeMaxDays >= v.transitTimeMinDays, {
    message: "Delivery: the maximum cannot be less than the minimum.",
  });

/**
 * Saves the courier half of the store settings, keeping everything else as
 * it is. Takes effect on the next request (updateTag), like the Settings page.
 */
export async function saveCourierSettingsAction(input: unknown): Promise<CourierActionResult> {
  const session = await requireOwner();
  const parsed = courierSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid settings." };
  const d = parsed.data;

  const before = await getStoreSettings();
  const next: StoreSettings = {
    ...before,
    courierPartners: d.courierPartners,
    shippingChargePaise: Math.round(d.shippingCharge * 100),
    freeShippingThresholdPaise: Math.round(d.freeShippingThreshold * 100),
    handlingTimeMinDays: d.handlingTimeMinDays,
    handlingTimeMaxDays: d.handlingTimeMaxDays,
    transitTimeMinDays: d.transitTimeMinDays,
    transitTimeMaxDays: d.transitTimeMaxDays,
  };

  try {
    await saveStoreSettings(next);
  } catch (err) {
    console.error("saveCourierSettingsAction failed", err);
    return { ok: false, error: "Could not save. Please try again." };
  }

  const changed = Object.fromEntries(
    Object.entries(next)
      .filter(([k, v]) => JSON.stringify(v) !== JSON.stringify((before as Record<string, unknown>)[k]))
      .map(([k, v]) => [k, { from: (before as Record<string, unknown>)[k] ?? null, to: v }])
  );
  const keys = Object.keys(changed);
  await logActivity(session, {
    action: "settings.update",
    target: { type: "settings", id: "courier" },
    summary: keys.length ? `Changed courier settings: ${keys.join(", ")}` : "Saved courier settings (no changes)",
    details: JSON.parse(JSON.stringify(changed)),
  });

  updateTag(STORE_SETTINGS_TAG);
  // The cart and checkout quote the shipping charge, and product pages publish
  // the delivery estimate as structured data — both are built from these.
  revalidatePath("/cart");
  revalidatePath("/checkout");
  revalidatePath("/products", "layout");
  revalidatePath("/admin/courier");
  return { ok: true };
}

const phone = z
  .string()
  .transform((v) => v.replace(/\D/g, "").slice(-10))
  .refine((v) => /^[6-9]\d{9}$/.test(v), { message: "Enter a 10-digit Indian mobile number." });

function courierError(err: unknown, fallback: string): { ok: false; error: string } {
  if (err instanceof NimbusPostError) return { ok: false, error: err.message };
  console.error(fallback, err);
  return { ok: false, error: fallback };
}

/** Step 1 of adding the pickup warehouse: NimbusPost texts an OTP to the contact. */
export async function sendWarehouseOtpAction(
  rawPhone: string
): Promise<{ ok: true; resendInSec: number | null } | { ok: false; error: string }> {
  await requireOwner();
  const p = phone.safeParse(rawPhone);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  try {
    return { ok: true, ...(await sendNimbusPostWarehouseOtp(p.data)) };
  } catch (err) {
    return courierError(err, "Could not send the OTP. Please try again.");
  }
}

const warehouseSchema = z.object({
  name: z.string().trim().min(2, "Give the warehouse a name.").max(40),
  address: z.string().trim().min(5, "Enter the street address.").max(150),
  addressOpt: z.string().trim().max(150).optional(),
  pincode: z.string().trim().regex(/^\d{6}$/, "Enter a 6-digit pincode."),
  city: z.string().trim().min(2, "Enter the city.").max(60),
  state: z.string().trim().min(2, "Enter the state.").max(60),
  contactName: z.string().trim().min(2, "Enter the contact's name.").max(60),
  contactPhone: phone,
  contactEmail: z.string().trim().email("Enter a valid email.").optional().or(z.literal("")),
  gst: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^$|^[0-9A-Z]{15}$/, "A GSTIN is 15 letters and digits.")
    .optional(),
  otp: z.string().trim().regex(/^\d{4,8}$/, "Enter the OTP from the text message."),
});

/**
 * Steps 2 and 3: check the OTP, create the warehouse in NimbusPost, and use it
 * for every NimbusPost booking from now on.
 */
export async function createWarehouseAction(
  input: unknown
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const session = await requireOwner();
  const parsed = warehouseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const w = parsed.data;
  try {
    const verificationId = await verifyNimbusPostWarehouseOtp(w.contactPhone, w.otp);
    const created = await createNimbusPostWarehouse({
      name: w.name,
      address: w.address,
      addressOpt: w.addressOpt || undefined,
      pincode: w.pincode,
      city: w.city,
      state: w.state,
      contactName: w.contactName,
      contactPhone: w.contactPhone,
      contactEmail: w.contactEmail || undefined,
      gst: w.gst || undefined,
      verificationId,
    });
    await saveCourierConfig({ nimbuspostWarehouseId: created.id, nimbuspostWarehouseName: created.name });
    await logActivity(session, {
      action: "settings.update",
      target: { type: "settings", id: "courier" },
      summary: `${created.created ? "Added" : "Linked existing"} NimbusPost pickup warehouse "${created.name}"`,
    });
    revalidatePath("/admin/courier");
    return { ok: true, name: created.name };
  } catch (err) {
    return courierError(err, "Could not add the warehouse. Please try again.");
  }
}

/** Use a warehouse that already exists in NimbusPost (added in their dashboard, say). */
export async function chooseWarehouseAction(id: string, name: string): Promise<CourierActionResult> {
  const session = await requireOwner();
  if (!id) return { ok: false, error: "Choose a warehouse." };
  await saveCourierConfig({ nimbuspostWarehouseId: id, nimbuspostWarehouseName: name.slice(0, 60) });
  await logActivity(session, {
    action: "settings.update",
    target: { type: "settings", id: "courier" },
    summary: `Set the NimbusPost pickup warehouse to "${name}"`,
  });
  revalidatePath("/admin/courier");
  return { ok: true };
}

/**
 * Registers our tracking webhook with NimbusPost, signed with a secret we
 * generate and keep — so tracking updates flow without anyone copying a
 * secret into Vercel. Only from the live site: NimbusPost needs a public
 * HTTPS address, which a dev machine doesn't have.
 */
export async function connectTrackingAction(): Promise<CourierActionResult> {
  const session = await requireOwner();
  const base = resolveAppBaseUrl(process.env.APP_BASE_URL, process.env.VERCEL_ENV === "production");
  if (!base.startsWith("https://") || /localhost|127\.0\.0\.1/.test(base)) {
    return { ok: false, error: "Connect tracking from the live site — NimbusPost can only send updates to a public https address." };
  }
  const secret = randomBytes(32).toString("hex");
  try {
    const hook = await createNimbusPostWebhook(`${base}/api/webhooks/nimbuspost`, secret);
    await saveCourierConfig({ nimbuspostWebhookId: hook.id, nimbuspostWebhookSecret: secret });
    await logActivity(session, {
      action: "settings.update",
      target: { type: "settings", id: "courier" },
      summary: "Connected NimbusPost tracking updates",
    });
    revalidatePath("/admin/courier");
    return { ok: true };
  } catch (err) {
    return courierError(err, "Could not connect tracking. Please try again.");
  }
}
