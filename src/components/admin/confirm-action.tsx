"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Result = { ok: true; message?: string } | { ok: false; error: string };

/**
 * One button for every owner action that needs a "are you sure?": delete,
 * block, clear, send. The server page passes the action already bound to its
 * target (`deleteOrderAction.bind(null, id)`), so this stays generic.
 *
 * Every action it runs re-checks the role itself (requireOwner) — hiding this
 * button from an admin is presentation, not the guard.
 */
export function ConfirmAction({
  action,
  label,
  title,
  description,
  confirmLabel,
  success,
  destructive = true,
  typeToConfirm,
  variant = "outline",
  redirectTo,
}: {
  action: () => Promise<Result>;
  label: string;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  /** Toast on success when the action returns no message of its own. */
  success: string;
  destructive?: boolean;
  typeToConfirm?: string;
  variant?: "outline" | "ghost" | "destructive" | "default";
  /** Where to go afterwards — for deletes, since the page itself is gone. */
  redirectTo?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const r = await action();
      setOpen(false);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? success);
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={variant}
        className={destructive && variant !== "destructive" ? "text-destructive hover:text-destructive" : undefined}
        disabled={isPending}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        destructive={destructive}
        typeToConfirm={typeToConfirm}
        disabled={isPending}
        onConfirm={run}
      />
    </>
  );
}
