import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors the real page's geometry — 21:9 hero, centred copy block, CTA — so
 * the streamed content lands without shifting anything.
 */
export function CollectionPageSkeleton() {
  return (
    <div>
      <section className="relative">
        <Skeleton className="aspect-[16/5] w-full rounded-none" />
        <div className="mx-auto flex max-w-3xl flex-col items-center px-4 rhythm-commerce">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-3 h-9 w-2/3" />
          <Skeleton className="mt-4 h-4 w-full max-w-xl" />
          <Skeleton className="mt-2 h-4 w-4/5 max-w-lg" />
          <Skeleton className="mt-6 h-9 w-32" />
        </div>
      </section>
    </div>
  );
}
