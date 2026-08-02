"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth/require-role";
import { OrderStatus } from "@/generated/prisma/enums";
import {
  updateOrderStatus,
  createShipmentForOrder,
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

export async function createShipmentAction(orderId: string): Promise<
  AdminOrderActionResult | { ok: true; trackingNumber: string }
> {
  await requireRole("admin");
  try {
    const result = await createShipmentForOrder(orderId);
    revalidatePath("/admin/orders");
    return { ok: true, trackingNumber: result.awbCode };
  } catch (err) {
    if (err instanceof AdminOrderError || err instanceof ShiprocketError) {
      return { ok: false, error: err.message };
    }
    console.error("createShipmentAction failed", err);
    return { ok: false, error: "Shipment creation failed. Please try again." };
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
