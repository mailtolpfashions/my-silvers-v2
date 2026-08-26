"use client";

import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * The one way this app asks "are you sure".
 *
 * ── Why it exists ────────────────────────────────────────────────────────────
 * There were four spellings of this. Two were hand-rolled inline panels that
 * pushed the page around when they opened; two were `window.confirm()`. None of
 * them trapped focus, closed on Escape, or announced themselves as a dialog —
 * so the most destructive controls in the admin were the least accessible
 * things in it. AlertDialog is the primitive built for exactly this, and this
 * wrapper is what stops the five call sites drifting apart again.
 *
 * ⚠️  `window.confirm` is not merely ugly. It is a BROWSER-CHROME dialog: it
 * says "localhost:3000 says" (or your domain, to a shopkeeper), it cannot be
 * styled or translated, it blocks the JavaScript thread, and some browsers let
 * a user tick "prevent this page from creating more dialogs" — after which the
 * delete button silently stops working with no way to discover why.
 *
 * ── Controlled, not trigger-based ────────────────────────────────────────────
 * Every call site already owns the state that decides whether to ask (a row id,
 * a boolean), because the button that opens it lives inside a table row or a
 * toolbar it cannot wrap. So this takes `open`/`onOpenChange` rather than
 * wrapping a trigger.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  /**
   * Defaults to true because every current caller is a delete. Set false for a
   * confirmation that merely wants a moment's thought — a red button for
   * something reversible cries wolf, and a panel that always looks alarming
   * stops being read.
   */
  destructive = true,
  /** Usually the caller's `isPending`, so the action cannot be double-fired. */
  disabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** ReactNode, not string — these explain consequences and want emphasis. */
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {/* Cancel first in the DOM. Radix focuses the cancel control on open,
              so the safe option is what a stray Enter hits. */}
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={disabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
