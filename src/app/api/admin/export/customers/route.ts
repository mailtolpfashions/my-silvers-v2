import { prisma } from "@/server/db";
import { auth } from "@/server/auth/auth";
import { toCsv, csvResponse } from "@/server/admin/csv";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "admin") return new Response("Forbidden", { status: 403 });

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
