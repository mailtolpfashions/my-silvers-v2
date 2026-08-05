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
import { SortableHeader } from "@/components/admin/sortable-header";

type SearchParams = Promise<{ q?: string; sort?: string; dir?: string }>;

/**
 * Sortable columns, as an allowlist — the key comes from the query string and
 * must never reach orderBy directly. See the note in server/products/admin.ts.
 *
 * Location is absent on purpose: it is read from a `take: 1` default address,
 * so there is no single column to order by without restructuring the query.
 */
const CUSTOMER_SORTS = {
  name: (dir: "asc" | "desc") => ({ name: dir }),
  email: (dir: "asc" | "desc") => ({ email: dir }),
  phone: (dir: "asc" | "desc") => ({ phone: dir }),
  orders: (dir: "asc" | "desc") => ({ orders: { _count: dir } }),
  joined: (dir: "asc" | "desc") => ({ createdAt: dir }),
} as const;

type CustomerSortKey = keyof typeof CUSTOMER_SORTS;

function isCustomerSortKey(value: unknown): value is CustomerSortKey {
  return typeof value === "string" && value in CUSTOMER_SORTS;
}

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const { q } = params;

  // Newest first by default — the most recent signups are what an admin
  // glances at.
  const currentSort: CustomerSortKey = isCustomerSortKey(params.sort) ? params.sort : "joined";
  const currentDir: "asc" | "desc" = params.dir === "asc" ? "asc" : "desc";

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
      orderBy: CUSTOMER_SORTS[currentSort](currentDir),
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
              {(
                [
                  ["name", "Name"],
                  ["email", "Email"],
                  ["phone", "Phone"],
                ] as const
              ).map(([column, label]) => (
                <SortableHeader
                  key={column}
                  basePath="/admin/customers"
                  column={column}
                  label={label}
                  currentSort={currentSort}
                  currentDir={currentDir}
                  params={params}
                />
              ))}
              {/* Comes from a take:1 related address — no single column to
                  order by, so it stays a plain header rather than a control
                  that does nothing. */}
              <TableHead>Location</TableHead>
              {(
                [
                  ["orders", "Orders"],
                  ["joined", "Joined"],
                ] as const
              ).map(([column, label]) => (
                <SortableHeader
                  key={column}
                  basePath="/admin/customers"
                  column={column}
                  label={label}
                  currentSort={currentSort}
                  currentDir={currentDir}
                  params={params}
                />
              ))}
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
