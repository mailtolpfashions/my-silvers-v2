import { Skeleton } from "@/components/ui/skeleton";

export default function CheckoutLoading() {
  return (
    <div className="container-checkout py-10">
      <Skeleton className="mb-8 h-8 w-40" />
      <div className="grid gap-10 md:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
        <Skeleton className="h-56 w-full" />
      </div>
    </div>
  );
}
