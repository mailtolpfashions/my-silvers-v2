"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireOwner, requireRole } from "@/server/auth/require-role";
import { logActivity } from "@/server/activity/log";
import { prisma } from "@/server/db";
import { addressSchema, PINCODE_STATE_MISMATCH, pincodeMatchesState } from "@/lib/validation/account";
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
import { cancelOrderAsStaff, CancelError } from "@/server/orders/cancel-order";
import { isOwner } from "@/server/auth/roles";
import { CANCEL_REASONS, isCancelReason, type CancelReason } from "@/lib/order-cancel-reasons";
import { sendOrderCancelledEmail } from "@/server/email/resend";

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
  // Owner only: the manual override skips every check the Actions column
  // makes. See OrderStatusSelect in components/admin/order-row-actions.tsx.
  const session = await requireOwner();
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
 * The Cancel order button. Any admin may cancel a COD or unpaid order; a paid
 * online order needs the owner, because cancelling it refunds the customer —
 * cancelOrderAsStaff enforces that from the FRESH role requireRole returns.
 */
export async function cancelOrderAsStaffAction(
  orderId: string,
  reason: string,
  note: string
): Promise<{ ok: true; refunded: boolean } | { ok: false; error: string }> {
  const session = await requireRole("admin");
  if (!isCancelReason(reason)) return { ok: false, error: "Choose a reason." };
  const detail = note.trim().slice(0, 200);
  if (reason === "other" && !detail) return { ok: false, error: "Say briefly why." };

  try {
    const result = await cancelOrderAsStaff(orderId, { mayRefund: isOwner(session.user.role) });
    await logActivity(session, {
      action: "order.cancel",
      target: { type: "order", id: orderId },
      summary:
        `Cancelled order ${result.orderNumber} — ${CANCEL_REASONS[reason]}` +
        (detail ? `: ${detail}` : "") +
        (result.refunded ? " (refunded)" : ""),
    });
    await emailCustomerAboutCancellation(orderId, reason);
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);
    return { ok: true, refunded: result.refunded };
  } catch (err) {
    if (err instanceof CancelError) return { ok: false, error: err.message };
    console.error("cancelOrderAsStaffAction failed", err);
    return { ok: false, error: "Could not cancel the order. Please try again." };
  }
}

/**
 * Tells the customer the shop cancelled their order. Never throws: the order is
 * already cancelled and refunded by now, and a mail outage must not turn that
 * into an error on the admin's screen.
 *
 * Read back AFTER the cancel, so the refund line reflects what actually
 * happened — refundStatus "completed" means Razorpay took it, "failed" means
 * it is queued for retry and the customer is still owed it.
 */
async function emailCustomerAboutCancellation(orderId: string, reason: CancelReason) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        orderNumber: true,
        totalAmount: true,
        refundStatus: true,
        confirmationToken: true,
        user: { select: { email: true, name: true } },
      },
    });
    // An erased customer's address is a placeholder that goes nowhere.
    if (!order?.user || order.user.email.endsWith("@deleted.invalid")) return;

    await sendOrderCancelledEmail({
      to: order.user.email,
      name: order.user.name,
      orderNumber: order.orderNumber,
      orderId,
      confirmationToken: order.confirmationToken,
      why: reason === "customer" || reason === "stock" ? reason : null,
      refund:
        order.refundStatus === "idle"
          ? null
          : {
              amount: order.totalAmount.toString(),
              state: order.refundStatus === "completed" ? "sent" : "pending",
            },
    });
  } catch (err) {
    console.error("order-cancelled email failed", orderId, err);
  }
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

// ─── Owner tools ─────────────────────────────────────────────────────────────

/**
 * Whether an order may be DELETED: no money ever moved, and no stock was taken.
 *   - no Razorpay payment id (nothing captured, nothing to refund);
 *   - payment pending or failed — never paid, never refunded;
 *   - online orders only, or a COD order already cancelled (a live COD order
 *     took stock when it was placed; cancelling it first gives that back).
 * Everything else is a financial record and must stay.
 */
export async function orderDeletable(o: {
  razorpayPaymentId: string | null;
  paymentStatus: string;
  paymentMethod: string;
  orderStatus: string;
}) {
  return (
    !o.razorpayPaymentId &&
    (o.paymentStatus === "pending" || o.paymentStatus === "failed") &&
    (o.paymentMethod === "razorpay" || o.orderStatus === "cancelled")
  );
}

const orderAddressSchema = addressSchema;

/** Correct the delivery address / phone — only while nothing has been booked. */
export async function updateOrderAddressAction(
  orderId: string,
  input: Record<string, unknown>
): Promise<AdminOrderActionResult> {
  const session = await requireOwner();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { orderNumber: true, orderStatus: true, shipmentCreatedAt: true, shiprocketOrderId: true },
  });
  if (!order) return { ok: false, error: "Order not found." };
  if (
    order.shipmentCreatedAt ||
    order.shiprocketOrderId ||
    !["placed", "confirmed", "processing"].includes(order.orderStatus)
  ) {
    return {
      ok: false,
      error: "The shipment is already booked — change the address with the courier instead.",
    };
  }

  const parsed = orderAddressSchema.safeParse({ ...input, label: "", isDefault: false });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the address." };
  const a = parsed.data;
  if (!pincodeMatchesState(a.pincode, a.state)) return { ok: false, error: PINCODE_STATE_MISMATCH };

  await prisma.order.update({
    where: { id: orderId },
    data: {
      shippingAddress: {
        fullName: a.fullName,
        phone: a.phone,
        addressLine1: a.addressLine1,
        addressLine2: a.addressLine2 ?? "",
        city: a.city,
        state: a.state,
        pincode: a.pincode,
      },
    },
  });
  await logActivity(session, {
    action: "order.address",
    target: { type: "order", id: orderId },
    summary: `Changed the delivery address on order ${order.orderNumber}`,
  });
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  return { ok: true };
}

/** A private note on the order — staff-only, never shown to the customer. */
export async function saveOrderNoteAction(orderId: string, note: string): Promise<AdminOrderActionResult> {
  const session = await requireOwner();
  const clean = String(note ?? "").trim().slice(0, 2000);
  const order = await prisma.order.update({
    where: { id: orderId },
    data: { adminNote: clean || null },
    select: { orderNumber: true },
  });
  await logActivity(session, {
    action: "order.note",
    target: { type: "order", id: orderId },
    summary: clean ? `Updated the note on order ${order.orderNumber}` : `Cleared the note on order ${order.orderNumber}`,
  });
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true };
}

/** Delete a junk / test order — refused for anything that touched money. */
export async function deleteOrderAction(orderId: string): Promise<AdminOrderActionResult> {
  const session = await requireOwner();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      orderNumber: true,
      razorpayPaymentId: true,
      paymentStatus: true,
      paymentMethod: true,
      orderStatus: true,
      totalAmount: true,
    },
  });
  if (!order) return { ok: false, error: "Order not found." };
  if (!(await orderDeletable(order))) {
    return {
      ok: false,
      error:
        "Only unpaid or cancelled orders can be deleted. Paid orders are financial records — cancel or refund instead.",
    };
  }
  await prisma.order.delete({ where: { id: orderId } });
  await logActivity(session, {
    action: "order.delete",
    target: { type: "order", id: orderId },
    summary: `Deleted order ${order.orderNumber} (₹${Number(order.totalAmount).toLocaleString("en-IN")}, ${order.paymentStatus})`,
  });
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  return { ok: true };
}
