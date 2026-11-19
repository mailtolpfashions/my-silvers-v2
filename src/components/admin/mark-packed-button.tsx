"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markOrdersPackedAction } from "@/actions/admin-order-actions";

/**
 * Placed / Confirmed → Packed, for one order or many (the labels page).
 * See markOrdersPackedAction for the rules the server enforces.
 */
export function MarkPackedButton({
  orderIds,
  label = "Mark as packed",
  variant = "outline",
}: {
  orderIds: string[];
  label?: string;
  variant?: "outline" | "default";
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      variant={variant}
      size="sm"
      disabled={isPending || orderIds.length === 0}
      onClick={() =>
        startTransition(async () => {
          const result = await markOrdersPackedAction(orderIds);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(
            result.packed === 1
              ? "Marked as packed."
              : `${result.packed} orders marked as packed.${result.skipped ? ` ${result.skipped} skipped (already packed, shipped or cancelled).` : ""}`
          );
          router.refresh();
        })
      }
    >
      <PackageCheck className="size-4" aria-hidden />
      {isPending ? "Marking…" : label}
    </Button>
  );
}
