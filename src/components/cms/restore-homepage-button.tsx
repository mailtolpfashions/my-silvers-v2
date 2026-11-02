"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { restoreHomepageAction } from "@/actions/cms-actions";

/**
 * The way back from a deleted homepage: recreates it, published, from the
 * copy bundled with the app (see restoreDefaultHomepage). Offered only on the
 * empty Homepage screen, so there is never an existing page for it to replace.
 */
export function RestoreHomepageButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await restoreHomepageAction();
          if (result.ok) {
            toast.success("Homepage restored and published.");
            router.refresh();
          } else {
            toast.error(result.error);
          }
        })
      }
    >
      {isPending ? "Restoring…" : "Restore the homepage"}
    </Button>
  );
}
