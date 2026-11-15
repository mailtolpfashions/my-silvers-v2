"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireOwner, requireRole } from "@/server/auth/require-role";
import { logActivity } from "@/server/activity/log";
import { prisma } from "@/server/db";
import { OrderStatus } from "@/generated/prisma/enums";
import {
  updateOrderStatus,
  createShipmentForOrder,
  assignAwbForOrder,
  schedulePickupForOrder,
  processReturn,
  AdminOrderError,
} from "@/server/orders/admin";
import { ShiprocketError } from "@/server/integrations/shiprocket";

export type AdminOrderActionResult = { ok: true } | { ok: false; error: string };

/** "MS-1042" for the log — the number staff and customers actually quote. */
async function orderLabel(orderId: string) {
  const o = await prisma.order.findUnique({
    where: { id: orderId },
    select: { orderNumber: true, totalAmount: true },
  });
  return { number: o?.orderNumber ?? orderId, total: o ? Number(o.totalAmount) : null };
}

const statusSchema = z.enum(
  Object.values(OrderStatus) as [OrderStatus, ...OrderStatus[]]
);

export async function updateOrderStatusAction(
  orderId: string,
  status: string
): Promise<AdminOrderActionResult> {
  const session = await requireRole("admin");
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: "Invalid status." };
  const before = await prisma.order.findUnique({ where: { id: orderId }, select: { orderStatus: true } });
  await updateOrderStatus(orderId, parsed.data);
  const { number } = await orderLabel(orderId);
  await logActivity(session, {
    action: "order.status",
    target: { type: "order", id: orderId },
    summary: `Changed order ${number} from ${before?.orderStatus ?? "?"} to ${parsed.data}`,
  });
  revalidatePath("/admin/orders");
  return { ok: true };
}

/**
 * Step one — free, and the safe end of the integration to exercise. See the
 * note at the top of integrations/shiprocket.ts.
 */
export async function createShipmentAction(orderId: string): Promise<AdminOrderActionResult> {
  const session = await requireRole("admin");
  try {
    await createShipmentForOrder(orderId);
    await logActivity(session, {
      action: "order.shipment",
      target: { type: "order", id: orderId },
      summary: `Created the shipment for order ${(await orderLabel(orderId)).number}`,
    });
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

/**
 * Step three — free. Schedules the collection and returns the courier's label
 * PDF so the admin never has to open the Shiprocket dashboard.
 */
export async function schedulePickupAction(
  orderId: string
): Promise<AdminOrderActionResult | { ok: true; labelUrl: string; scheduledFor: string | null }> {
  const session = await requireRole("admin");
  try {
    const result = await schedulePickupForOrder(orderId);
    await logActivity(session, {
      action: "order.pickup",
      target: { type: "order", id: orderId },
      summary: `Scheduled the courier pickup for order ${(await orderLabel(orderId)).number}`,
    });
    revalidatePath("/admin/orders");
    return { ok: true, ...result };
  } catch (err) {
    if (err instanceof AdminOrderError || err instanceof ShiprocketError) {
      return { ok: false, error: err.message };
    }
    console.error("schedulePickupAction failed", err);
    return { ok: false, error: "Could not schedule the pickup. Please try again." };
  }
}

/** Step two — ⚠️ billable. Books a courier and buys the waybill. */
export async function assignAwbAction(
  orderId: string
): Promise<AdminOrderActionResult | { ok: true; trackingNumber: string }> {
  const session = await requireRole("admin");
  try {
    const awb = await assignAwbForOrder(orderId);
    await logActivity(session, {
      action: "order.awb",
      target: { type: "order", id: orderId },
      summary: `Bought waybill ${awb.awbCode} for order ${(await orderLabel(orderId)).number}`,
    });
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
  // Money leaving the shop is the owner's call. Approving a return on a PAID
  // order is too, refund or not: once approved it is marked "returned" and the
  // refund decision would have no screen left to happen on. Rejecting a
  // return, and approving one on an unpaid (COD) order, stay with every admin.
  const paid = await prisma.order.findUnique({
    where: { id: orderId },
    select: { paymentStatus: true },
  });
  const ownerCall = refund || (action === "approve" && paid?.paymentStatus === "paid");
  const session = ownerCall ? await requireOwner() : await requireRole("admin");
  try {
    const result = await processReturn(orderId, action, refund);
    const { number, total } = await orderLabel(orderId);
    await logActivity(session, {
      action: result.refunded ? "order.refund" : "order.return",
      target: { type: "order", id: orderId },
      summary: result.refunded
        ? `Refunded ₹${(total ?? 0).toLocaleString("en-IN")} on order ${number}`
        : `${action === "approve" ? "Approved" : "Rejected"} the return on order ${number}`,
    });
    revalidatePath("/admin/orders");
    return { ok: true };
  } catch (err) {
    if (err instanceof AdminOrderError) return { ok: false, error: err.message };
    console.error("processReturnAction failed", err);
    return { ok: false, error: "Could not process the return." };
  }
}
