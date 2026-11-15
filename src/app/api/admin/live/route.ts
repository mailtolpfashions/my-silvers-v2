import { requireRole } from "@/server/auth/require-role";
import { getLiveToShip } from "@/server/admin/dashboard";

/**
 * What NewOrderWatcher polls every 30 seconds from any admin page: how many
 * orders are waiting to be shipped, and the newest of them.
 *
 * Two indexed counts and nothing else — it runs twice a minute for every open
 * admin tab. Never cached: the whole point is that a paid order shows up
 * within one poll.
 */
export async function GET() {
  try {
    await requireRole("admin");
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  return Response.json(await getLiveToShip(), {
    headers: { "Cache-Control": "no-store" },
  });
}
