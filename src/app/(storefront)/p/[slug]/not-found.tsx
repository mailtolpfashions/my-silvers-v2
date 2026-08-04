import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function PageNotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">We couldn&apos;t find that page</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        The page may have moved, or the link may be out of date.
      </p>
      <Button asChild className="mt-8">
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
