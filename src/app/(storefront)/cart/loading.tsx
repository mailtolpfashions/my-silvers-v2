import { Skeleton } from "@/components/ui/skeleton";

export default function CartLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Skeleton className="mb-8 h-8 w-40" />
      <div className="grid gap-10 md:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-56 w-full" />
      </div>
    </div>
  );
}
