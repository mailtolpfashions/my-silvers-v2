import { Skeleton } from "@/components/ui/skeleton";

/**
 * Covers the whole /account subtree. Everything under it is per-shopper, so
 * none of it can be cached — streaming a shell is the only lever available.
 */
export default function AccountLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Skeleton className="h-8 w-56" />
      <div className="mt-8 space-y-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    </div>
  );
}
