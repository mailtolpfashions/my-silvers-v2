import Link from "next/link";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require-role";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CopyButton } from "@/components/admin/copy-button";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { SortableHeader } from "@/components/admin/sortable-header";

/**
 * A deliberately blocking route.
 *
 * `cacheComponents` requires runtime data — the session, params, cookies — to
 * sit behind a <Suspense> boundary, or the route cannot prerender a shell. On
 * the storefront that matters and those pages stream. Here it does not, and
 * saying so explicitly is more honest than wrapping a dashboard in skeletons
 * to satisfy a validator:
 *
 *   - everything on this page is per-shopkeeper and behind a login, so there
 *     is no shell worth prerendering and nothing to share between visitors;
 *   - it is opened a handful of times a day by staff, not by shoppers, so no
 *     conversion and no crawl budget rides on it;
 *   - the data IS the page. A skeleton would be replaced wholesale a moment
 *     later, which is a flicker rather than a head start.
 *
 * This is what the error's own `[block]` remedy is for. It does not change how
 * the route renders; it records that blocking is the intended behaviour.
 */
export const instant = false;

/**
 * Newsletter subscribers.
 *
 * They were collected since launch with no way to see them, which meant the
 * list existed and was unusable. Deliberately a small screen: read, search and
 * copy, no editing. Unsubscribing is the subscriber's decision and happens
 * through their own link — an admin toggle here would be a way to opt someone
 * back IN, which is not a button worth building.
 */
const PAGE_SIZE = 50;

/**
 * Sortable columns, as an allowlist — the key comes from the query string and
 * must never reach orderBy directly. See the note in server/products/admin.ts.
 */
const SUBSCRIBER_SORTS = {
  email: (dir: "asc" | "desc") => ({ email: dir }),
  subscribed: (dir: "asc" | "desc") => ({ subscribedAt: dir }),
  status: (dir: "asc" | "desc") => ({ active: dir }),
} as const;

type SubscriberSortKey = keyof typeof SUBSCRIBER_SORTS;

function isSubscriberSortKey(value: unknown): value is SubscriberSortKey {
  return typeof value === "string" && value in SUBSCRIBER_SORTS;
}

export default async function AdminNewsletterPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; sort?: string; dir?: string }>;
}) {
  await requireRole("admin");

  const params = await searchParams;
  const { q, page: rawPage } = params;
  const page = Number(rawPage) > 0 ? Number(rawPage) : 1;
  const search = q?.trim();

  // Newest first by default — who signed up recently is the question this
  // screen is usually opened to answer.
  const currentSort: SubscriberSortKey = isSubscriberSortKey(params.sort)
    ? params.sort
    : "subscribed";
  const currentDir: "asc" | "desc" = params.dir === "asc" ? "asc" : "desc";

  const where = search
    ? { email: { contains: search, mode: "insensitive" as const } }
    : {};

  const [subscribers, matching, activeRows] = await Promise.all([
    prisma.newsletterSubscriber.findMany({
      where,
      orderBy: SUBSCRIBER_SORTS[currentSort](currentDir),
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, email: true, subscribedAt: true, active: true },
    }),
    prisma.newsletterSubscriber.count({ where }),
    /**
     * ⚠️  Every active address, NOT just this page's.
     *
     * The copy button promises "copy N active" and has to deliver all N.
     * Building the string from `subscribers` above — which is what this page
     * did before it was paginated — would quietly copy fifty addresses while
     * claiming to copy five thousand, and nobody would notice until a campaign
     * went to a fraction of the list.
     *
     * Cheap even at scale: one indexed column, strings only.
     */
    prisma.newsletterSubscriber.findMany({
      where: { active: true },
      select: { email: true },
      orderBy: { subscribedAt: "desc" },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(matching / PAGE_SIZE));
  const activeEmails = activeRows.map((s) => s.email).join(", ");

  const hrefFor = (next: number) => {
    // Named `search` rather than `params` to leave the searchParams object of
    // that name above visible — the sort headers read it.
    const query = new URLSearchParams();
    if (search) query.set("q", search);
    // Paging must not silently drop the sort, or page 2 comes back in a
    // different order from page 1.
    if (params.sort) query.set("sort", params.sort);
    if (params.dir) query.set("dir", params.dir);
    if (next > 1) query.set("page", String(next));
    const qs = query.toString();
    return qs ? `/admin/newsletter?${qs}` : "/admin/newsletter";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Newsletter"
        description="Everyone who has signed up. Copy the active list into whatever you send with."
        actions={
          activeRows.length > 0 ? (
            <CopyButton value={activeEmails} label={`Copy ${activeRows.length} active`} />
          ) : undefined
        }
      />

      {/* GET form, so a search is a linkable URL rather than client state. */}
      <form action="/admin/newsletter" className="flex gap-2">
        <input
          name="q"
          defaultValue={search ?? ""}
          placeholder="Search by email"
          className="h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 text-sm"
        />
        {search && (
          <Link
            href="/admin/newsletter"
            className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted"
          >
            Clear
          </Link>
        )}
      </form>

      {subscribers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {search ? `No address matches “${search}”.` : "Nobody has subscribed yet."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  {(
                    [
                      ["email", "Email"],
                      ["subscribed", "Subscribed"],
                      ["status", "Status"],
                    ] as const
                  ).map(([column, label]) => (
                    <SortableHeader
                      key={column}
                      basePath="/admin/newsletter"
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
                {subscribers.map((subscriber) => (
                  <TableRow key={subscriber.id}>
                    <TableCell>
                      <a
                        href={`mailto:${subscriber.email}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {subscriber.email}
                      </a>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {subscriber.subscribedAt.toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      {subscriber.active ? (
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900">
                          Active
                        </span>
                      ) : (
                        <span className="rounded bg-muted px-2 py-0.5 text-xs">Unsubscribed</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AdminPagination
        page={page}
        totalPages={totalPages}
        total={matching}
        label={matching === 1 ? "subscriber" : "subscribers"}
        hrefFor={hrefFor}
      />
    </div>
  );
}
