import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function BlogPostNotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 rhythm-commerce text-center">
      <h1 className="text-h2">We couldn&apos;t find that story</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        It may have been unpublished, or the link may be out of date.
      </p>
      <Button asChild className="mt-8">
        <Link href="/blog">Read the journal</Link>
      </Button>
    </div>
  );
}
