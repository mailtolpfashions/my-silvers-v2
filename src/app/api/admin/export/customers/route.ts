import { prisma } from "@/server/db";
import { requireOwner } from "@/server/auth/require-role";
import { logActivity } from "@/server/activity/log";
import { toCsv, csvResponse } from "@/server/admin/csv";

export async function GET() {
  // getCurrentRole(), not session.user.role: the token carries the role from
  // sign-in and never refreshes it, so a revoked admin could still pull a full
  // CSV of this data for as long as their session lasted. See require-role.ts.
  // Owner only — these hand over customers' names, phones and addresses in bulk.
  const session = await requireOwner().catch(() => null);
  if (!session) return new Response("Forbidden", { status: 403 });
  await logActivity(session, {
    action: "export.customers",
    target: { type: "export" },
    summary: "Downloaded the customers export",
  });

  const customers = await prisma.user.findMany({
    where: { role: "customer" },
    include: {
      addresses: { where: { isDefault: true }, take: 1 },
      _count: { select: { orders: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const csv = toCsv(
    ["name", "email", "phone", "city", "state", "orders", "joined"],
    customers.map((c) => [
      c.name ?? "",
      c.email,
      c.phone ?? "",
      c.addresses[0]?.city ?? "",
      c.addresses[0]?.state ?? "",
      c._count.orders,
      c.createdAt.toISOString().slice(0, 10),
    ])
  );

  return csvResponse(csv, "customers.csv");
}
