import { Skeleton } from "@/components/ui/skeleton";

/**
 * A guest order lookup is per-order and token-gated — nothing here is
 * cacheable, so this boundary exists to declare that and stream a shell rather
 * than block the whole route.
 */
export default function OrderLoading() {
  return (
    <div className="container-checkout rhythm-transactional">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="mt-2 h-4 w-40" />
      <div className="mt-8 space-y-4">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="mt-8 h-40 w-full" />
    </div>
  );
}
