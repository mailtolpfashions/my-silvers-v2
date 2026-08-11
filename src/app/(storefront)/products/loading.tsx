import { ProductGridSkeleton } from "@/components/storefront/product-card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProductsLoading() {
  return (
    <div className="container-page rhythm-commerce">
      <Skeleton className="h-9 w-72" />
      <div className="mt-6">
        <Skeleton className="h-10 w-full max-w-2xl" />
      </div>
      <ProductGridSkeleton count={12} />
    </div>
  );
}
