import { getCurrentRole } from "@/server/auth/require-role";
import { resolveHomepageSections } from "@/server/products/homepage-sections";
import type { EntryData } from "@/server/cms/types";

/**
 * Resolves a draft homepage's sections into what the storefront would render.
 *
 * The preview pane is a client component fed by postMessage, so it only has the
 * editor's in-memory form data — and every section is a database query it can't
 * make. Without this the preview showed no sections at all.
 *
 * Hero slides deliberately do NOT come through here: they live on the draft
 * itself, so the preview renders them instantly as the editor types.
 *
 * Calls the same resolver the real page calls, so the two cannot drift.
 */
export async function POST(req: Request) {
  // Preview resolves unpublished draft content; same gate as the Studio itself.
  // An explicit 403 rather than requireRole(), which throws and would surface
  // as a 500 — matching the other CMS route handlers.
  // From the database, not the token: session.user.role is written once at
  // sign-in and never refreshed, so a revoked editor would keep this open for
  // as long as their session lasted. See require-role.ts.
  const role = await getCurrentRole();
  if (role !== "admin" && role !== "editor") {
    return new Response("Forbidden", { status: 403 });
  }

  let data: EntryData;
  try {
    data = (await req.json()) as EntryData;
  } catch {
    return new Response("Malformed body", { status: 400 });
  }

  // Only sections need the server now — hero slides live on the draft itself,
  // so the preview renders them without a round trip.
  const sections = await resolveHomepageSections(data);

  return Response.json(
    { sections },
    // Per-editor, per-keystroke, and never useful twice.
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
