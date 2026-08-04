import { ProductCardSkeleton } from "@/components/storefront/product-card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function WishlistLoading() {
  return (
    <div className="container-page py-10">
      <Skeleton className="mb-8 h-8 w-48" />
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
