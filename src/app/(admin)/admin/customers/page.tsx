import Link from "next/link";
import { prisma } from "@/server/db";
import { Button } from "@/components/ui/button";
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
import { PageHeader } from "@/components/layout/page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { EmptyState } from "@/components/layout/empty-state";

type SearchParams = Promise<{ q?: string; sort?: string; dir?: string; page?: string }>;

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

/** Rows per page. Matches Orders, so paging feels the same across the panel. */
const CUSTOMER_PAGE_SIZE = 25;

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
  const page = Number(params.page) > 0 ? Number(params.page) : 1;

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

  const [customers, totalCustomers, matchingCustomers] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        addresses: { where: { isDefault: true }, take: 1 },
        _count: { select: { orders: true } },
      },
      orderBy: CUSTOMER_SORTS[currentSort](currentDir),
      // Was a bare `take: 100` with no pagination and no count, so customer 101
      // did not exist as far as this screen was concerned and nothing said so.
      // Silent truncation is worse than a slow page.
      skip: (page - 1) * CUSTOMER_PAGE_SIZE,
      take: CUSTOMER_PAGE_SIZE,
    }),
    // Unfiltered: the stat card above answers "how many customers are there",
    // which must not move when someone types in the search box.
    prisma.user.count({ where: { role: "customer" } }),
    // Filtered: what the pager is counting through.
    prisma.user.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(matchingCustomers / CUSTOMER_PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Everyone who has placed an order or created an account."
      />

      <Card className="max-w-xs">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total customers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-h1 font-semibold">{totalCustomers}</p>
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
            {customers.length === 0 && (
              <TableRow className="hover:bg-transparent">
                {/* Name, email, phone, location, orders, joined. */}
                <TableCell colSpan={6} className="p-0">
                  <EmptyState
                    title="No customers match"
                    description="Customers appear here once they place an order or create an account."
                    action={
                      <Button asChild variant="outline" size="sm">
                        <Link href="/admin/customers">Clear search</Link>
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <AdminPagination
        page={page}
        totalPages={totalPages}
        total={matchingCustomers}
        label={matchingCustomers === 1 ? "customer" : "customers"}
        hrefFor={(next) => {
          const search = new URLSearchParams();
          if (q) search.set("q", q);
          if (params.sort) search.set("sort", params.sort);
          if (params.dir) search.set("dir", params.dir);
          if (next > 1) search.set("page", String(next));
          const qs = search.toString();
          return qs ? `/admin/customers?${qs}` : "/admin/customers";
        }}
      />
    </div>
  );
}
