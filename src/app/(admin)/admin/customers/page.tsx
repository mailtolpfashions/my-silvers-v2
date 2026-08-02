import { prisma } from "@/server/db";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerSearch } from "@/components/admin/customer-search";

type SearchParams = Promise<{ q?: string }>;

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { q } = await searchParams;

  const where = {
    role: "customer" as const,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q } },
          ],
        }
      : {}),
  };

  const [customers, totalCustomers] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        addresses: { where: { isDefault: true }, take: 1 },
        _count: { select: { orders: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.user.count({ where: { role: "customer" } }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Customers</h1>

      <Card className="max-w-xs">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total customers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">{totalCustomers}</p>
        </CardContent>
      </Card>

      <CustomerSearch initialQuery={q ?? ""} />

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Orders</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell className="text-sm font-medium">{customer.name ?? "—"}</TableCell>
                <TableCell className="text-sm">{customer.email}</TableCell>
                <TableCell className="text-sm">{customer.phone ?? "—"}</TableCell>
                <TableCell className="text-sm">
                  {customer.addresses[0]
                    ? `${customer.addresses[0].city}, ${customer.addresses[0].state}`
                    : "—"}
                </TableCell>
                <TableCell className="text-sm">{customer._count.orders}</TableCell>
                <TableCell className="text-sm">
                  {customer.createdAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
