import { listReviews, reviewCounts, type ReviewFilter } from "@/server/admin/reviews";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ReviewTable } from "@/components/admin/review-table";
import { FilterTabs } from "@/components/admin/filter-tabs";
import { AdminPagination } from "@/components/admin/admin-pagination";

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

// Pending leads and is the default view — it is the only tab with work in it.
const FILTERS: Array<{ key: ReviewFilter; label: string }> = [
  { key: "pending", label: "Awaiting approval" },
  { key: "approved", label: "Published" },
  { key: "rejected", label: "Rejected" },
  { key: "unverified", label: "Unverified" },
  { key: "all", label: "All" },
];

const DEFAULT_FILTER: ReviewFilter = "pending";

/**
 * Review moderation.
 *
 * Before this existed, a shopper could post anything and there was no way to
 * take it down short of a database console — the storefront rendered every
 * review it had. That was the gap this screen closes.
 *
 * It has since become load-bearing rather than remedial: reviews arrive as
 * `pending` and nothing reaches the storefront until it is approved here. An
 * unvisited queue now reads to shoppers as a shop with no reviews at all, which
 * is why the pending count is also pushed onto the dashboard by
 * getAttentionItems.
 */
export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const filter = (FILTERS.find((f) => f.key === sp.filter)?.key ?? DEFAULT_FILTER) as ReviewFilter;
  const page = Number(sp.page) > 0 ? Number(sp.page) : 1;

  const [{ rows, total, pageSize }, counts] = await Promise.all([
    listReviews({ filter, q: sp.q, page }),
    reviewCounts(),
  ]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const query = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { filter, q: sp.q, page: String(page), ...patch };
    for (const [key, value] of Object.entries(merged)) {
      if (!value) continue;
      // Keep the default out of the URL so /admin/reviews stays the queue's
      // own address. Checked against `key` as well as value — the old version
      // dropped any parameter whose value happened to be the default, which
      // silently swallowed a search for that word.
      if (key === "filter" && value === DEFAULT_FILTER) continue;
      if (key === "page" && value === "1") continue;
      params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `/admin/reviews?${qs}` : "/admin/reviews";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reviews"
        description="Nothing a shopper writes appears on the storefront until it is approved here. Approving and rejecting are both reversible; deleting lets the customer write a new one."
      />

      <div className="flex flex-wrap items-center gap-3">
        <FilterTabs
          tabs={FILTERS.map((f) => ({
            ...f,
            count:
              f.key === "all"
                ? counts.all
                : f.key === "pending"
                  ? counts.pending
                  : f.key === "approved"
                    ? counts.approved
                    : f.key === "rejected"
                      ? counts.rejected
                      : counts.unverified,
          }))}
          current={filter}
          hrefFor={(key) => query({ filter: key, page: undefined })}
        />

        {/* GET form, so a search is a linkable URL rather than client state. */}
        <form className="ml-auto flex gap-2" action="/admin/reviews">
          {filter !== DEFAULT_FILTER && <input type="hidden" name="filter" value={filter} />}
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Search text, product or customer"
            className="h-9 w-64 rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </form>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {/* An empty PENDING tab is the good outcome, not an absence — it
                means the queue is clear. Saying "no reviews yet" there would
                read as a problem on a shop with a hundred published reviews. */}
            {sp.q
              ? `Nothing matches “${sp.q}”.`
              : filter === "pending"
                ? "Nothing waiting — every review has been looked at."
                : "No reviews yet."}
          </CardContent>
        </Card>
      ) : (
        <ReviewTable
          reviews={rows.map((r) => ({
            id: r.id,
            rating: r.rating,
            title: r.title,
            comment: r.comment,
            status: r.status,
            isVerifiedPurchase: r.isVerifiedPurchase,
            createdAt: r.createdAt.toISOString(),
            customerName: r.user.name ?? r.user.email,
            productName: r.product.name,
            productSlug: r.product.slug,
            productImage: r.product.images[0] ?? null,
            imageUrl: r.imageUrl,
          }))}
        />
      )}

      <AdminPagination
        page={page}
        totalPages={pages}
        total={total}
        label={total === 1 ? "review" : "reviews"}
        hrefFor={(next) => query({ page: String(next) })}
      />
    </div>
  );
}
