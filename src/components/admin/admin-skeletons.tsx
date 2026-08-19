import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The shapes admin routes show while their data is in flight.
 *
 * ── One component, not one per route ─────────────────────────────────────────
 * Every admin screen is a heading, an optional row of controls and a table, so
 * a skeleton per `loading.tsx` would be the same markup written eight times —
 * the exact duplication that left the panel with two different table
 * implementations. Each route passes its own column count and calls it done.
 *
 * ── Why these exist at all ───────────────────────────────────────────────────
 * There was no loading.tsx anywhere under (admin), so every click sat on the
 * previous page until the server answered, with nothing to say the click had
 * landed. That is what earns a second click and a duplicate action.
 *
 * The point is to hold the LAYOUT, not to entertain. Matching the real row
 * height and column count means the content lands where the skeleton was
 * instead of shoving the page around as it arrives.
 */
export function AdminTableSkeleton({
  columns = 5,
  rows = 8,
  /** Set for screens that carry a search box or filter tabs above the table. */
  controls = false,
}: {
  columns?: number;
  rows?: number;
  controls?: boolean;
}) {
  return (
    <div className="space-y-6">
      <AdminHeadingSkeleton />

      {controls && (
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-20" />
          <Skeleton className="ml-auto h-9 w-64" />
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {/* A header band, then rows, so the eye lands in the same place the
              real table's header will occupy. */}
          <div className="border-b px-4 py-3">
            <div className="flex gap-4">
              {Array.from({ length: columns }, (_, i) => (
                <Skeleton key={i} className="h-3 flex-1" />
              ))}
            </div>
          </div>
          {Array.from({ length: rows }, (_, row) => (
            <div key={row} className="border-b px-4 py-4 last:border-0">
              <div className="flex items-center gap-4">
                {Array.from({ length: columns }, (_, col) => (
                  <Skeleton
                    key={col}
                    // The first column is a name or an image and reads wider;
                    // uniform bars look like a loading spinner pretending to be
                    // a table.
                    className={`h-4 ${col === 0 ? "flex-[1.6]" : "flex-1"}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/** Title and description block, matching PageHeader's rhythm. */
export function AdminHeadingSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  );
}

/** For screens that lead with figures — the dashboard, payments, finance. */
export function AdminStatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i}>
          <CardContent className="space-y-2 p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
