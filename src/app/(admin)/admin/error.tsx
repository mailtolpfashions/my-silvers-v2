"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Catches errors thrown anywhere under /admin.
 *
 * ── Why it sits here rather than being left to the root boundary ─────────────
 * Placed at `admin/`, this renders INSIDE the admin layout, so a failed query
 * costs the operator one panel — the sidebar, the account menu and every other
 * section stay where they are. Without it the failure escaped to the root
 * boundary, which replaces the whole document: the admin chrome disappeared and
 * the only way back was the browser's own back button.
 *
 * That is not a hypothetical. A dropped connection in the Supabase pooler took
 * out arbitrary admin pages repeatedly, and there was nothing to catch it.
 *
 * ── The digest is shown on purpose ───────────────────────────────────────────
 * Server error messages are stripped in production — all the operator gets is a
 * digest, and it is the only handle Sentry can be searched by. Printing it lets
 * whoever hit the error paste a string into a message instead of describing a
 * blank screen.
 */
export default function AdminError({
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
    <Card className="mx-auto max-w-lg">
      <CardContent className="space-y-4 p-8 text-center">
        <h1 className="text-lg font-semibold">This page didn&apos;t load</h1>
        <p className="text-sm text-muted-foreground">
          Something failed on the way to fetching it — often a dropped database connection, which
          usually clears on a retry. The rest of the admin is still working.
        </p>

        {error.digest && (
          <p className="text-xs text-muted-foreground">
            Reference <code className="rounded bg-muted px-1.5 py-0.5">{error.digest}</code>
          </p>
        )}

        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Button onClick={reset}>Try again</Button>
          <Button asChild variant="outline">
            <Link href="/admin">Back to dashboard</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
