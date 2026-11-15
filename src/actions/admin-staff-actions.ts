"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireOwner } from "@/server/auth/require-role";
import { logActivity } from "@/server/activity/log";
import { ROLE_LABELS } from "@/server/auth/roles";
import { issuePasswordToken } from "@/server/auth/password-reset";
import { sendStaffAccessEmail } from "@/server/email/resend";
import type { Role } from "@/generated/prisma/enums";

/**
 * Staff and roles — the owner's alone (/admin/staff).
 *
 * A role change takes effect on the person's very next click: every gate reads
 * the role from the database (getCurrentRole / requireRole), never from the
 * sign-in cookie. Only the PROXY's quick pre-check reads the cookie, so a
 * newly PROMOTED person is still turned away at the door until they sign in
 * again — the page says so.
 *
 * Rules, enforced here rather than trusted to the page:
 *   - nobody changes their own role (no accidental self-lockout);
 *   - the last owner can never be demoted or removed;
 *   - an account must already exist — the person signs up on the shop first,
 *     so the owner never handles anyone's password.
 */
export type StaffActionResult = { ok: true; message?: string } | { ok: false; error: string };

const STAFF_ROLES = ["admin", "editor", "superadmin"] as const;
const staffRole = z.enum(STAFF_ROLES);

async function ownerCount() {
  return prisma.user.count({ where: { role: "superadmin" } });
}

/** Give an existing account a staff role. */
export async function addStaffAction(email: string, role: string): Promise<StaffActionResult> {
  const session = await requireOwner();
  const parsedEmail = z.string().trim().toLowerCase().email().safeParse(email);
  if (!parsedEmail.success) return { ok: false, error: "That email does not look right." };
  const parsedRole = staffRole.safeParse(role);
  if (!parsedRole.success) return { ok: false, error: "Choose Admin or Editor." };

  const user = await prisma.user.findUnique({
    where: { email: parsedEmail.data },
    select: { id: true, role: true, name: true },
  });
  if (!user) {
    return {
      ok: false,
      error:
        "No account uses that email yet. Ask them to create an account on the shop first (Sign in → Create one), then add them here.",
    };
  }
  if (user.id === session.user.id) return { ok: false, error: "You can't change your own role." };
  if (user.role !== "customer") {
    return { ok: false, error: `They are already ${ROLE_LABELS[user.role]}. Change their role in the list below.` };
  }

  await prisma.user.update({ where: { id: user.id }, data: { role: parsedRole.data } });
  await logActivity(session, {
    action: "staff.add",
    target: { type: "user", id: user.id },
    summary: `Made ${parsedEmail.data} ${ROLE_LABELS[parsedRole.data]}`,
  });
  revalidatePath("/admin/staff");
  return {
    ok: true,
    message: `${parsedEmail.data} is now ${ROLE_LABELS[parsedRole.data]}. They need to sign out and back in once.`,
  };
}

/** Change a staff member's role, or remove them (back to customer). */
export async function setStaffRoleAction(userId: string, role: string): Promise<StaffActionResult> {
  const session = await requireOwner();
  const parsed = z.enum([...STAFF_ROLES, "customer"]).safeParse(role);
  if (!parsed.success) return { ok: false, error: "Unknown role." };
  const next = parsed.data as Role;

  if (userId === session.user.id) return { ok: false, error: "You can't change your own role." };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, email: true },
  });
  if (!user) return { ok: false, error: "That account no longer exists." };
  if (user.role === next) return { ok: true };
  if (user.role === "customer") return { ok: false, error: "That account isn't staff — add them by email instead." };

  // Belt and braces: the self-check above already covers the owner acting on
  // themselves, but two owners demoting each other at once must not leave none.
  if (user.role === "superadmin" && (await ownerCount()) <= 1) {
    return { ok: false, error: "The shop must always have at least one owner." };
  }

  await prisma.user.update({ where: { id: userId }, data: { role: next } });
  await logActivity(session, {
    action: next === "customer" ? "staff.remove" : "staff.role",
    target: { type: "user", id: userId },
    summary:
      next === "customer"
        ? `Removed ${user.email} from staff (was ${ROLE_LABELS[user.role]})`
        : `Changed ${user.email} from ${ROLE_LABELS[user.role]} to ${ROLE_LABELS[next]}`,
  });
  revalidatePath("/admin/staff");
  return { ok: true };
}

const INVITE_DAYS = 7;

/**
 * Create a staff login directly — for someone who doesn't have a shop account
 * yet. The owner never chooses or sees the password: the new person gets an
 * email with a 7-day link to set their own (sendStaffAccessEmail).
 */
export async function createStaffAction(input: {
  name: string;
  email: string;
  role: string;
}): Promise<StaffActionResult> {
  const session = await requireOwner();
  const name = String(input.name ?? "").trim();
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Enter their name." };
  const email = z.string().trim().toLowerCase().email().safeParse(input.email);
  if (!email.success) return { ok: false, error: "That email does not look right." };
  const role = z.enum(["admin", "editor"]).safeParse(input.role);
  if (!role.success) return { ok: false, error: "Choose Admin or Editor." };

  const existing = await prisma.user.findUnique({ where: { email: email.data }, select: { role: true } });
  if (existing) {
    return {
      ok: false,
      error:
        existing.role === "customer"
          ? "That email already has a shop account — use “Add an existing account” instead."
          : "That person is already staff.",
    };
  }

  const user = await prisma.user.create({
    data: { email: email.data, name, role: role.data },
    select: { id: true },
  });
  const token = await issuePasswordToken(user.id, INVITE_DAYS * 24 * 60 * 60 * 1000);
  let mailed = true;
  try {
    await sendStaffAccessEmail({
      to: email.data,
      name,
      rawToken: token,
      roleLabel: ROLE_LABELS[role.data],
      kind: "invite",
      days: INVITE_DAYS,
    });
  } catch (err) {
    mailed = false;
    console.error("[staff] invite email failed", err);
  }

  await logActivity(session, {
    action: "staff.create",
    target: { type: "user", id: user.id },
    summary: `Created a ${ROLE_LABELS[role.data]} login for ${email.data}`,
  });
  revalidatePath("/admin/staff");
  return mailed
    ? { ok: true, message: `Invite sent to ${email.data}. The link works for ${INVITE_DAYS} days.` }
    : {
        ok: true,
        message: `Login created, but the invite email failed. Use “Send password link” to try again.`,
      };
}

/** Email a staff member a fresh link to set their password. */
export async function sendStaffPasswordLinkAction(userId: string): Promise<StaffActionResult> {
  const session = await requireOwner();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!user || user.role === "customer") return { ok: false, error: "That isn't a staff account." };

  const token = await issuePasswordToken(user.id, INVITE_DAYS * 24 * 60 * 60 * 1000);
  try {
    await sendStaffAccessEmail({
      to: user.email,
      name: user.name,
      rawToken: token,
      roleLabel: ROLE_LABELS[user.role],
      kind: "reset",
      days: INVITE_DAYS,
    });
  } catch (err) {
    console.error("[staff] reset email failed", err);
    return { ok: false, error: "The email could not be sent. Check the email service (Resend)." };
  }
  await logActivity(session, {
    action: "staff.password",
    target: { type: "user", id: user.id },
    summary: `Sent a password link to ${user.email}`,
  });
  return { ok: true, message: `Password link sent to ${user.email}.` };
}
