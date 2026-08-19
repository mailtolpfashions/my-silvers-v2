import Link from "next/link";
import { listReviews, reviewCounts, type ReviewFilter } from "@/server/admin/reviews";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ReviewTable } from "@/components/admin/review-table";

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

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const count =
            f.key === "all"
              ? counts.all
              : f.key === "published"
                ? counts.published
                : f.key === "hidden"
                  ? counts.hidden
                  : counts.unverified;
          const active = f.key === filter;
          return (
            <Link
              key={f.key}
              href={query({ filter: f.key, page: undefined })}
              className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                active ? "border-foreground bg-foreground text-background" : "hover:bg-muted"
              }`}
            >
              {f.label}
              <span className={active ? "opacity-70" : "text-muted-foreground"}>{count}</span>
            </Link>
          );
        })}

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

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {pages} — {total} reviews
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={query({ page: String(page - 1) })} className="rounded-md border px-3 py-1.5 hover:bg-muted">
                Previous
              </Link>
            )}
            {page < pages && (
              <Link href={query({ page: String(page + 1) })} className="rounded-md border px-3 py-1.5 hover:bg-muted">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
