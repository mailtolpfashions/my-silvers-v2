import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { ROLE_LABELS } from "@/server/auth/roles";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { OwnerOnlyNotice, viewerIsOwner } from "@/components/admin/owner-only";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Blocking, like every other admin route — see admin/customers/page.tsx. */
export const instant = false;

const PAGE_SIZE = 50;

/**
 * The filter chips. Each area is the prefix of `action` before the dot — see
 * logActivity() in server/activity/log.ts. Anything new must use one of these
 * prefixes or it will only show under "Everything".
 */
const AREAS = {
  order: "Orders & refunds",
  product: "Products",
  category: "Categories",
  review: "Reviews",
  coupon: "Coupons",
  settings: "Settings",
  finance: "Money",
  staff: "Staff",
  cms: "Website (CMS)",
  export: "Downloads",
} as const;

type Area = keyof typeof AREAS;
const isArea = (v: unknown): v is Area => typeof v === "string" && v in AREAS;

type SearchParams = Promise<{ area?: string; who?: string; page?: string }>;

export default async function AdminActivityPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await viewerIsOwner())) return <OwnerOnlyNotice area="the activity log" />;

  const params = await searchParams;
  const area = isArea(params.area) ? params.area : undefined;
  const who = params.who || undefined;
  const page = Number(params.page) > 0 ? Number(params.page) : 1;

  const where: Prisma.ActivityLogWhereInput = {
    ...(area ? { action: { startsWith: `${area}.` } } : {}),
    ...(who ? { actorEmail: who } : {}),
  };

  const [entries, total, people] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({
      distinct: ["actorEmail"],
      select: { actorEmail: true },
      orderBy: { actorEmail: "asc" },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (next: { area?: string; who?: string; page?: number }) => {
    const q = new URLSearchParams();
    const a = "area" in next ? next.area : area;
    const w = "who" in next ? next.who : who;
    if (a) q.set("area", a);
    if (w) q.set("who", w);
    if (next.page && next.page > 1) q.set("page", String(next.page));
    const s = q.toString();
    return `/admin/activity${s ? `?${s}` : ""}`;
  };

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs ${active ? "border-foreground bg-foreground text-background" : "hover:bg-muted"}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity log"
        description="Who did what in the admin and the CMS, newest first. Entries can't be edited or deleted."
      />

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Link href={href({ area: undefined, page: 1 })} className={chip(!area)}>
            Everything
          </Link>
          {(Object.keys(AREAS) as Area[]).map((key) => (
            <Link key={key} href={href({ area: key, page: 1 })} className={chip(area === key)}>
              {AREAS[key]}
            </Link>
          ))}
        </div>
        {people.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <Link href={href({ who: undefined, page: 1 })} className={chip(!who)}>
              Everyone
            </Link>
            {people.map((p) => (
              <Link
                key={p.actorEmail}
                href={href({ who: p.actorEmail, page: 1 })}
                className={chip(who === p.actorEmail)}
              >
                {p.actorEmail}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">When</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>What happened</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {e.createdAt.toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Kolkata",
                  })}
                </TableCell>
                <TableCell className="text-sm">
                  {e.actorEmail}
                  <span className="ml-2 text-xs text-muted-foreground">{ROLE_LABELS[e.actorRole]}</span>
                </TableCell>
                <TableCell className="text-sm">
                  {e.summary}
                  {e.targetType === "order" && e.targetId && (
                    <Link
                      href={`/admin/orders/${e.targetId}`}
                      className="ml-2 text-xs underline underline-offset-2"
                    >
                      Open order
                    </Link>
                  )}
                  {e.targetType === "product" && e.targetId && !e.action.endsWith(".delete") && (
                    <Link
                      href={`/admin/products/${e.targetId}`}
                      className="ml-2 text-xs underline underline-offset-2"
                    >
                      Open product
                    </Link>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {entries.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={3} className="p-0">
                  <EmptyState
                    title="Nothing recorded yet"
                    description="Changes made in the admin and CMS from now on will appear here."
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
        total={total}
        label={total === 1 ? "entry" : "entries"}
        hrefFor={(p) => href({ page: p })}
      />
    </div>
  );
}
