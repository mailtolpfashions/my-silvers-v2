"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth/require-role";
import { OrderStatus } from "@/generated/prisma/enums";
import {
  updateOrderStatus,
  createShipmentForOrder,
  assignAwbForOrder,
  processReturn,
  AdminOrderError,
} from "@/server/orders/admin";
import { ShiprocketError } from "@/server/integrations/shiprocket";

export type AdminOrderActionResult = { ok: true } | { ok: false; error: string };

const statusSchema = z.enum(
  Object.values(OrderStatus) as [OrderStatus, ...OrderStatus[]]
);

export async function updateOrderStatusAction(
  orderId: string,
  status: string
): Promise<AdminOrderActionResult> {
  await requireRole("admin");
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: "Invalid status." };
  await updateOrderStatus(orderId, parsed.data);
  revalidatePath("/admin/orders");
  return { ok: true };
}

/**
 * Step one — free, and the safe end of the integration to exercise. See the
 * note at the top of integrations/shiprocket.ts.
 */
export async function createShipmentAction(orderId: string): Promise<AdminOrderActionResult> {
  await requireRole("admin");
  try {
    await createShipmentForOrder(orderId);
    revalidatePath("/admin/orders");
    return { ok: true };
  } catch (err) {
    if (err instanceof AdminOrderError || err instanceof ShiprocketError) {
      return { ok: false, error: err.message };
    }
    console.error("createShipmentAction failed", err);
    return { ok: false, error: "Shipment creation failed. Please try again." };
  }
}

/** Step two — ⚠️ billable. Books a courier and buys the waybill. */
export async function assignAwbAction(
  orderId: string
): Promise<AdminOrderActionResult | { ok: true; trackingNumber: string }> {
  await requireRole("admin");
  try {
    const awb = await assignAwbForOrder(orderId);
    revalidatePath("/admin/orders");
    return { ok: true, trackingNumber: awb.awbCode };
  } catch (err) {
    if (err instanceof AdminOrderError || err instanceof ShiprocketError) {
      return { ok: false, error: err.message };
    }
    console.error("assignAwbAction failed", err);
    return { ok: false, error: "Could not assign a waybill. Please try again." };
  }
}

export async function processReturnAction(
  orderId: string,
  action: "approve" | "reject",
  refund: boolean
): Promise<AdminOrderActionResult> {
  await requireRole("admin");
  try {
    await processReturn(orderId, action, refund);
    revalidatePath("/admin/orders");
    return { ok: true };
  } catch (err) {
    if (err instanceof AdminOrderError) return { ok: false, error: err.message };
    console.error("processReturnAction failed", err);
    return { ok: false, error: "Could not process the return." };
  }
}
