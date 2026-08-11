import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ProductNotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 rhythm-commerce text-center">
      <h1 className="text-h2">This piece isn&apos;t available</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        It may have been retired from the collection. There&apos;s plenty more to see.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/products">Browse jewellery</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/collections">View collections</Link>
        </Button>
      </div>
    </div>
  );
}
