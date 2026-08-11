"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";

/**
 * Catches errors thrown anywhere under the storefront.
 *
 * This matters more now that pages stream: once the first chunk is flushed the
 * status code is already committed, so an error boundary is the only thing that
 * can present the failure to the shopper.
 */
export default function StorefrontError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg px-4 rhythm-commerce text-center">
      <h1 className="text-h2">Something went wrong</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        We couldn&apos;t load this page. Please try again — if it keeps happening, our team has
        been notified.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
