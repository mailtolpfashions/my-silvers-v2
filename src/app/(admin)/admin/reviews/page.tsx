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

const FILTERS: Array<{ key: ReviewFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "published", label: "Visible" },
  { key: "hidden", label: "Hidden" },
  { key: "unverified", label: "Unverified" },
];

/**
 * Review moderation.
 *
 * Before this existed, a shopper could post anything and there was no way to
 * take it down short of a database console — the storefront rendered every
 * review it had. That was the gap this screen closes.
 */
export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const filter = (FILTERS.find((f) => f.key === sp.filter)?.key ?? "all") as ReviewFilter;
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
      if (value && value !== "all" && !(key === "page" && value === "1")) params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `/admin/reviews?${qs}` : "/admin/reviews";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reviews"
        description="Everything shoppers have written. Hiding is reversible; deleting lets the customer write a new one."
      />

      <div className="flex flex-wrap items-center gap-3">
        <FilterTabs
          tabs={FILTERS.map((f) => ({
            ...f,
            count:
              f.key === "all"
                ? counts.all
                : f.key === "published"
                  ? counts.published
                  : f.key === "hidden"
                    ? counts.hidden
                    : counts.unverified,
          }))}
          current={filter}
          hrefFor={(key) => query({ filter: key, page: undefined })}
        />

        {/* GET form, so a search is a linkable URL rather than client state. */}
        <form className="ml-auto flex gap-2" action="/admin/reviews">
          {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
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
            {sp.q ? `Nothing matches “${sp.q}”.` : "No reviews yet."}
          </CardContent>
        </Card>
      ) : (
        <ReviewTable
          reviews={rows.map((r) => ({
            id: r.id,
            rating: r.rating,
            title: r.title,
            comment: r.comment,
            isPublished: r.isPublished,
            isVerifiedPurchase: r.isVerifiedPurchase,
            createdAt: r.createdAt.toISOString(),
            customerName: r.user.name ?? r.user.email,
            productName: r.product.name,
            productSlug: r.product.slug,
            productImage: r.product.images[0] ?? null,
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
