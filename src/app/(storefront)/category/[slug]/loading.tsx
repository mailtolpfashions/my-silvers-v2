import { ProductCardSkeleton } from "@/components/storefront/product-card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function CategoryLoading() {
  return (
    <div className="container-page py-10">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-2 h-4 w-80" />

      {/* Matches the category grid's own columns and gaps, which differ from
          /products — keep the two in step if either changes. */}
      <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
