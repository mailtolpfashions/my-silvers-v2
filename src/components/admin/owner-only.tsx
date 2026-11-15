import { Lock } from "lucide-react";
import { getCurrentRole } from "@/server/auth/require-role";
import { isOwner } from "@/server/auth/roles";

/**
 * What an admin sees on an owner-only page (/admin/staff, /activity, /finance,
 * /coupons, /settings) — a plain explanation rather than a redirect, so a
 * partner who follows an old bookmark knows the page exists and who to ask.
 *
 * This is presentation. The data behind each page is guarded separately by
 * requireOwner() in its readers and actions.
 */
export function OwnerOnlyNotice({ area }: { area: string }) {
  return (
    <div className="mx-auto mt-16 max-w-md border p-8 text-center">
      <Lock className="mx-auto size-6 text-muted-foreground" aria-hidden />
      <h1 className="mt-4 text-h3">Only the owner can open {area}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ask the shop owner if you need something changed here.
      </p>
    </div>
  );
}

/** True when the signed-in user is the owner, read from the database. */
export async function viewerIsOwner(): Promise<boolean> {
  return isOwner(await getCurrentRole());
}
