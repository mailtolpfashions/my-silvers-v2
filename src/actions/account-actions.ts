"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { auth } from "@/server/auth/auth";
import {
  addressSchema,
  profileSchema,
  MAX_ADDRESSES,
  type AddressInput,
} from "@/lib/validation/account";

export type ActionState = { error?: string; success?: string } | undefined;

async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error("UNAUTHENTICATED");
  return id;
}

/** First validation issue, as a single message for the form. */
function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Please check the form and try again.";
}

// ─── Profile ────────────────────────────────────────────────────────────────

export async function updateProfileAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return { error: "Please sign in again." };
  }

  const parsed = profileSchema.safeParse({
    title: formData.get("title") ?? "",
    name: formData.get("name") ?? "",
    phone: formData.get("phone") ?? "",
    dateOfBirth: formData.get("dateOfBirth") ?? "",
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { title, name, phone, dateOfBirth } = parsed.data;

  await prisma.user.update({
    where: { id: userId },
    data: {
      title: title ?? null,
      name,
      phone: phone ?? null,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
    },
  });

  revalidatePath("/account");
  return { success: "Profile updated." };
}

// ─── Addresses ──────────────────────────────────────────────────────────────

/**
 * Shared insert used by the address book form and by checkout. Enforces the
 * MAX_ADDRESSES cap and the single-default invariant in one transaction —
 * a partial unique index rejects a second default, so the old one must be
 * cleared before the new row lands.
 *
 * Throws Error("ADDRESS_LIMIT") when the customer is already at the cap.
 */
async function insertAddress(userId: string, input: AddressInput) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.address.count({ where: { userId } });
    if (existing >= MAX_ADDRESSES) throw new Error("ADDRESS_LIMIT");

    // The first address is always the default, otherwise checkout has nothing
    // to preselect.
    const makeDefault = input.isDefault || existing === 0;

    if (makeDefault) {
      await tx.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    await tx.address.create({
      data: {
        userId,
        label: input.label ?? null,
        fullName: input.fullName,
        phone: input.phone,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2 ?? null,
        city: input.city,
        state: input.state,
        pincode: input.pincode,
        isDefault: makeDefault,
      },
    });
  });
}

/**
 * Saves the address a customer typed at checkout into their address book.
 * Deliberately never throws: the order has already been placed by the time
 * this runs, so a failure here must not surface as a checkout error. Silently
 * no-ops when they're at the address limit.
 */
export async function saveCheckoutAddressAction(input: {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
}): Promise<{ saved: boolean }> {
  try {
    const userId = await requireUserId();
    const parsed = addressSchema.safeParse({ ...input, label: "", isDefault: false });
    if (!parsed.success) return { saved: false };

    await insertAddress(userId, parsed.data);
    revalidatePath("/account/addresses");
    return { saved: true };
  } catch {
    return { saved: false };
  }
}

export async function addAddressAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return { error: "Please sign in again." };
  }

  const parsed = addressSchema.safeParse({
    label: formData.get("label") ?? "",
    fullName: formData.get("fullName") ?? "",
    phone: formData.get("phone") ?? "",
    addressLine1: formData.get("addressLine1") ?? "",
    addressLine2: formData.get("addressLine2") ?? "",
    city: formData.get("city") ?? "",
    state: formData.get("state") ?? "",
    pincode: formData.get("pincode") ?? "",
    isDefault: formData.get("isDefault") === "on",
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;

  try {
    await insertAddress(userId, input);
  } catch (error) {
    if (error instanceof Error && error.message === "ADDRESS_LIMIT") {
      return {
        error: `You can save up to ${MAX_ADDRESSES} addresses. Delete one to add another.`,
      };
    }
    throw error;
  }

  revalidatePath("/account/addresses");
  return { success: "Address saved." };
}

export async function updateAddressAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return { error: "Please sign in again." };
  }

  const addressId = String(formData.get("addressId") ?? "");
  if (!addressId) return { error: "Missing address." };

  const parsed = addressSchema.safeParse({
    label: formData.get("label") ?? "",
    fullName: formData.get("fullName") ?? "",
    phone: formData.get("phone") ?? "",
    addressLine1: formData.get("addressLine1") ?? "",
    addressLine2: formData.get("addressLine2") ?? "",
    city: formData.get("city") ?? "",
    state: formData.get("state") ?? "",
    pincode: formData.get("pincode") ?? "",
    isDefault: formData.get("isDefault") === "on",
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;

  // Scope by userId as well as id so one customer can't edit another's address.
  const owned = await prisma.address.findFirst({
    where: { id: addressId, userId },
    select: { id: true, isDefault: true },
  });
  if (!owned) return { error: "Address not found." };

  await prisma.$transaction(async (tx) => {
    if (input.isDefault && !owned.isDefault) {
      await tx.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    await tx.address.update({
      where: { id: addressId },
      data: {
        label: input.label ?? null,
        fullName: input.fullName,
        phone: input.phone,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2 ?? null,
        city: input.city,
        state: input.state,
        pincode: input.pincode,
        // Never let the only default be unset — checkout needs one.
        isDefault: input.isDefault || owned.isDefault,
      },
    });
  });

  revalidatePath("/account/addresses");
  return { success: "Address updated." };
}

export async function deleteAddressAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return { error: "Please sign in again." };
  }

  const addressId = String(formData.get("addressId") ?? "");
  if (!addressId) return { error: "Missing address." };

  const owned = await prisma.address.findFirst({
    where: { id: addressId, userId },
    select: { id: true, isDefault: true },
  });
  if (!owned) return { error: "Address not found." };

  await prisma.$transaction(async (tx) => {
    await tx.address.delete({ where: { id: addressId } });

    // Promote another address so the customer is never left without a default.
    if (owned.isDefault) {
      const next = await tx.address.findFirst({
        where: { userId },
        orderBy: { id: "asc" },
        select: { id: true },
      });
      if (next) {
        await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    }
  });

  revalidatePath("/account/addresses");
  return { success: "Address deleted." };
}

export async function setDefaultAddressAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return { error: "Please sign in again." };
  }

  const addressId = String(formData.get("addressId") ?? "");
  const owned = await prisma.address.findFirst({
    where: { id: addressId, userId },
    select: { id: true },
  });
  if (!owned) return { error: "Address not found." };

  await prisma.$transaction(async (tx) => {
    await tx.address.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });
    await tx.address.update({ where: { id: addressId }, data: { isDefault: true } });
  });

  revalidatePath("/account/addresses");
  return { success: "Default address updated." };
}
