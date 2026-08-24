import { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { getCurrentRole } from "@/server/auth/require-role";
import { toCsv, csvResponse } from "@/server/admin/csv";

export async function GET(req: NextRequest) {
  // getCurrentRole(), not session.user.role: the token carries the role from
  // sign-in and never refreshes it, so a revoked admin could still pull a full
  // CSV of this data for as long as their session lasted. See require-role.ts.
  if ((await getCurrentRole()) !== "admin") return new Response("Forbidden", { status: 403 });

  const orders = await prisma.order.findMany({
    include: { user: { select: { name: true, email: true } }, items: true },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });

  if (req.nextUrl.searchParams.get("format") === "json") {
    return Response.json({
      title: "Orders",
      headers: ["Order", "Date", "Customer", "Total", "Payment", "Status"],
      rows: orders.map((o) => [
        o.orderNumber,
        o.createdAt.toISOString().slice(0, 10),
        o.user.name ?? o.user.email,
        o.totalAmount.toString(),
        o.paymentMethod === "cod" ? "COD" : o.paymentStatus,
        o.orderStatus,
      ]),
    });
  }

  const csv = toCsv(
    [
      "orderNumber", "date", "customer", "email", "items", "subtotal",
      "shipping", "total", "paymentMethod", "paymentStatus", "orderStatus",
      "trackingNumber", "courier",
    ],
    orders.map((o) => [
      o.orderNumber,
      o.createdAt.toISOString(),
      o.user.name ?? "",
      o.user.email,
      o.items.map((i) => `${i.name} x${i.quantity}`).join("; "),
      o.subtotal.toString(),
      o.shippingCharge.toString(),
      o.totalAmount.toString(),
      o.paymentMethod,
      o.paymentStatus,
      o.orderStatus,
      o.trackingNumber ?? "",
      o.courierName ?? "",
    ])
  );

  return csvResponse(csv, "orders.csv");
}
