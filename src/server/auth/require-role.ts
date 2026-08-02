import { auth } from "@/server/auth/auth";
import type { Role } from "@/generated/prisma/enums";

/**
 * Defense-in-depth role check for Server Actions and Route Handlers.
 * Middleware already gates page navigation, but every mutating entry point
 * must re-check independently — never trust middleware alone.
 */
export async function requireRole(...allowed: Role[]) {
  const session = await auth();
  const role = session?.user?.role;
  if (!role || !allowed.includes(role)) {
    throw new Error("FORBIDDEN");
  }
  return session!;
}
