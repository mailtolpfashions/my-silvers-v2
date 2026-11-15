"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireOwner } from "@/server/auth/require-role";
import { logActivity } from "@/server/activity/log";
import {
  addressSchema,
  MAX_ADDRESSES,
  PINCODE_STATE_MISMATCH,
  pincodeMatchesState,
  profileSchema,
} from "@/lib/validation/account";

/**
 * Owner tools for a customer account (/admin/customers/[id]).
 *
 * Every action is owner-only and logged. Staff accounts are refused here on
 * purpose — they are managed on /admin/staff, where the rules about the last
 * owner and changing your own role live.
 */
export type CustomerActionResult = { ok: true; message?: string } | { ok: false; error: string };

async function customerOrRefuse(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, email: true, name: true },
  });
  if (!user) return { error: "That customer no longer exists." } as const;
  if (user.role !== "customer") return { error: "Staff accounts are managed on Staff & roles." } as const;
  return { user } as const;
}

const revalidate = (id: string) => {
  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${id}`);
};

export async function updateCustomerProfileAction(
  id: string,
  input: { name: string; phone: string }
): Promise<CustomerActionResult> {
  const session = await requireOwner();
  const found = await customerOrRefuse(id);
  if ("error" in found) return { ok: false, error: found.error! };

  const parsed = profileSchema
    .pick({ name: true, phone: true })
    .safeParse({ name: input.name, phone: input.phone });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." };

  await prisma.user.update({
    where: { id },
    data: { name: parsed.data.name, phone: parsed.data.phone ?? null },
  });
  await logActivity(session, {
    action: "customer.update",
    target: { type: "user", id },
    summary: `Edited customer ${found.user.email}`,
  });
  revalidate(id);
  return { ok: true };
}

export async function saveCustomerAddressAction(
  userId: string,
  addressId: string | null,
  input: Record<string, unknown>
): Promise<CustomerActionResult> {
  const session = await requireOwner();
  const found = await customerOrRefuse(userId);
  if ("error" in found) return { ok: false, error: found.error! };

  const parsed = addressSchema.safeParse({ ...input, isDefault: Boolean(input.isDefault) });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the address." };
  const a = parsed.data;
  if (!pincodeMatchesState(a.pincode, a.state)) return { ok: false, error: PINCODE_STATE_MISMATCH };

  const data = {
    label: a.label ?? null,
    fullName: a.fullName,
    phone: a.phone,
    addressLine1: a.addressLine1,
    addressLine2: a.addressLine2 ?? null,
    city: a.city,
    state: a.state,
    pincode: a.pincode,
  };

  if (addressId) {
    const owned = await prisma.address.findFirst({ where: { id: addressId, userId }, select: { id: true } });
    if (!owned) return { ok: false, error: "That address no longer exists." };
  } else if ((await prisma.address.count({ where: { userId } })) >= MAX_ADDRESSES) {
    return { ok: false, error: `A customer can have up to ${MAX_ADDRESSES} addresses.` };
  }

  await prisma.$transaction(async (tx) => {
    if (a.isDefault) {
      await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    if (addressId) {
      await tx.address.update({
        where: { id: addressId },
        data: { ...data, ...(a.isDefault ? { isDefault: true } : {}) },
      });
    } else {
      const first = (await tx.address.count({ where: { userId } })) === 0;
      await tx.address.create({ data: { ...data, userId, isDefault: a.isDefault || first } });
    }
  });

  await logActivity(session, {
    action: "customer.address",
    target: { type: "user", id: userId },
    summary: `${addressId ? "Edited" : "Added"} an address for ${found.user.email}`,
  });
  revalidate(userId);
  return { ok: true };
}

export async function deleteCustomerAddressAction(
  userId: string,
  addressId: string
): Promise<CustomerActionResult> {
  const session = await requireOwner();
  const found = await customerOrRefuse(userId);
  if ("error" in found) return { ok: false, error: found.error! };

  const gone = await prisma.address.deleteMany({ where: { id: addressId, userId } });
  if (gone.count === 0) return { ok: false, error: "That address no longer exists." };
  await logActivity(session, {
    action: "customer.address",
    target: { type: "user", id: userId },
    summary: `Deleted an address for ${found.user.email}`,
  });
  revalidate(userId);
  return { ok: true };
}

/** Block: can't sign in, can't order. Unblock reverses it. */
export async function setCustomerBlockedAction(id: string, blocked: boolean): Promise<CustomerActionResult> {
  const session = await requireOwner();
  const found = await customerOrRefuse(id);
  if ("error" in found) return { ok: false, error: found.error! };

  await prisma.user.update({ where: { id }, data: { blockedAt: blocked ? new Date() : null } });
  if (blocked) {
    // End any database sessions (Google sign-ins). Password sign-ins use a
    // signed cookie that can't be revoked from here — but every way back in
    // and every checkout now refuses a blocked account.
    await prisma.session.deleteMany({ where: { userId: id } });
  }
  await logActivity(session, {
    action: blocked ? "customer.block" : "customer.unblock",
    target: { type: "user", id },
    summary: `${blocked ? "Blocked" : "Unblocked"} customer ${found.user.email}`,
  });
  revalidate(id);
  return { ok: true };
}

/**
 * Delete a customer.
 *
 * With no orders, the account is removed outright (its addresses, cart,
 * wishlist and reviews go with it — they cascade).
 *
 * WITH orders it can't be removed: Indian tax law requires the order records
 * to be kept, and every order points at its account. So the PERSON is erased
 * instead — name, phone, email, birthday, addresses, cart, wishlist, reviews,
 * sign-ins, newsletter and back-in-stock requests — and the account is closed.
 * The orders remain, showing "Deleted customer". What the orders themselves
 * hold (the delivery address on each) is the tax record and stays.
 */
export async function deleteCustomerAction(id: string): Promise<CustomerActionResult> {
  const session = await requireOwner();
  const found = await customerOrRefuse(id);
  if ("error" in found) return { ok: false, error: found.error! };
  const email = found.user.email;

  const orders = await prisma.order.count({ where: { userId: id } });
  if (orders === 0) {
    await prisma.$transaction([
      prisma.newsletterSubscriber.deleteMany({ where: { email } }),
      prisma.stockNotification.deleteMany({ where: { email } }),
      prisma.user.delete({ where: { id } }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.address.deleteMany({ where: { userId: id } }),
      prisma.cart.deleteMany({ where: { userId: id } }),
      prisma.wishlist.deleteMany({ where: { userId: id } }),
      prisma.review.deleteMany({ where: { userId: id } }),
      prisma.session.deleteMany({ where: { userId: id } }),
      prisma.account.deleteMany({ where: { userId: id } }),
      prisma.newsletterSubscriber.deleteMany({ where: { email } }),
      prisma.stockNotification.deleteMany({ where: { email } }),
      prisma.user.update({
        where: { id },
        data: {
          email: `deleted-${id}@deleted.invalid`,
          name: "Deleted customer",
          phone: null,
          dateOfBirth: null,
          image: null,
          title: null,
          passwordHash: null,
          emailVerified: null,
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
          blockedAt: new Date(),
        },
      }),
    ]);
  }

  // No email in the summary: this is the record of an erasure, and it must
  // not be the one place the address survives.
  await logActivity(session, {
    action: "customer.delete",
    target: { type: "user", id },
    summary:
      orders === 0
        ? "Deleted a customer account (no orders)"
        : `Erased a customer's personal details and closed the account (${orders} order${orders === 1 ? "" : "s"} kept for tax records)`,
  });
  revalidate(id);
  return { ok: true, message: orders === 0 ? "Customer deleted." : "Customer erased; their orders are kept." };
}
