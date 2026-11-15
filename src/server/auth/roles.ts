import type { Role } from "@/generated/prisma/enums";

/**
 * Who counts as what. The ONE place role hierarchy is decided.
 *
 *   superadmin  the shop's owner — passes every gate, plus the owner-only ones
 *   admin       day-to-day running: products, orders, shipping, customers
 *   editor      the CMS only
 *
 * Pure functions on a role value, safe in the proxy, server components and
 * client components alike. Whatever role you pass in must come from the
 * DATABASE for anything that decides what a user may do — see
 * getCurrentRole() in require-role.ts. The cookie's copy is frozen at sign-in.
 */
type MaybeRole = Role | string | null | undefined;

export const isOwner = (role: MaybeRole) => role === "superadmin";

export const isAdmin = (role: MaybeRole) => role === "admin" || role === "superadmin";

export const isStaff = (role: MaybeRole) =>
  role === "admin" || role === "editor" || role === "superadmin";

/** Shopper-facing names, used on the Staff and Activity pages. */
export const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Owner",
  admin: "Admin",
  editor: "Editor",
  customer: "Customer",
};
