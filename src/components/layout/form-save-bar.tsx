"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The bar that appears at the foot of an editor once something has changed.
 *
 * Modelled on the pattern Shopify and WordPress both settled on, and for the
 * same reason: the Save button used to live at the very bottom of the form, so
 * on a long product page you edited a field near the top and then scrolled past
 * twenty more to reach it — with nothing on screen in between telling you there
 * was anything to save.
 *
 * ── `sticky`, not `fixed` ───────────────────────────────────────────────────
 * Sticky keeps the bar inside the page's own column, so it never sits over the
 * sidebar. It also occupies layout at the end of the flow, which means it
 * cannot cover the last field — a fixed bar needs bottom padding added to the
 * form to compensate, and that padding is always slightly wrong.
 *
 * ── The negative margins cancel the page's padding, on all three sides ──────
 * `main` carries `p-4 sm:p-6`. `-mx-*` lets the bar bleed to the left and right
 * edges of the working area; `-mb-*` does the same at the foot. Without that
 * last one there was a 24px band of background beneath the bar once you
 * scrolled to the bottom — measured, not theorised — which read as the bar
 * having come unstuck.
 *
 * ⚠️  These three must stay in step with `main`'s padding in
 * dashboard-shell.tsx. Change one and the bar stops being flush.
 *
 * ── It is always there; only the WARNING is conditional ─────────────────────
 * The bar itself is permanent, so Save and Cancel are in one fixed place and a
 * long form never has to be scrolled to the bottom to be submitted. What
 * appears on the first edit is the "Unsaved changes" line and the Discard
 * button — those are the parts that mean something only once there is
 * something to lose.
 *
 * It briefly rendered only when dirty, which had a a hole in it: a new product
 * has nothing dirty until you type, so a create form opened with no visible
 * submit at all.
 */
export function FormSaveBar({
  dirty,
  saving,
  saveLabel = "Save changes",
  onSave,
  onDiscard,
  onCancel,
  extra,
}: {
  dirty: boolean;
  saving: boolean;
  saveLabel?: string;
  /**
   * Saves on click. Omit inside a real <form> and the button submits instead.
   *
   * Both exist because the two editors are built differently: the product form
   * is a genuine <form onSubmit>, while the CMS editor drives server actions
   * from onClick handlers and has no form element to submit.
   */
  onSave?: () => void;
  /** Resets the form to its last saved values. Omitted when there is nothing to reset to. */
  onDiscard?: () => void;
  /** Leaves without saving — always available, unlike Discard. */
  onCancel?: () => void;
  /** Secondary controls — publish, delete, preview. */
  extra?: React.ReactNode;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 -mb-4 mt-6 border-t bg-background/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:-mb-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Holds the row's left edge even when empty, so Save does not jump
            sideways the moment the form becomes dirty. */}
        <p className="flex min-h-5 items-center gap-2 text-sm text-muted-foreground">
          {dirty && (
            <>
              <AlertCircle className="size-4 shrink-0" aria-hidden />
              Unsaved changes
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {extra}
          {onCancel && (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          )}
          {/* Only offered once there is something to revert TO. */}
          {dirty && onDiscard && (
            <Button type="button" variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>
              Discard
            </Button>
          )}
          <Button
            type={onSave ? "button" : "submit"}
            size="sm"
            disabled={saving}
            onClick={onSave}
          >
            {saving ? "Saving…" : saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
