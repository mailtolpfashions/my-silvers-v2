import { cn } from "@/lib/utils";

/**
 * Keeps a form's Save / Update buttons on screen while the form scrolls.
 *
 * `sticky`, not `fixed` — the same choice FormSaveBar makes, for the same
 * reasons: the bar stays inside the form's own column, it takes up space at
 * the end of the form so it can never cover the last field, and it stops
 * sticking once the form ends. FormSaveBar is the full editor bar (unsaved
 * warning, Discard); this is just the buttons, for shorter forms.
 *
 * `inDialog` is for a form inside DialogContent, which scrolls itself (see
 * ui/dialog.tsx). The negative margins cancel the dialog's p-4 so the bar
 * reaches its edges and sits flush with its bottom, and the background is the
 * dialog's own, so fields scrolling underneath don't show through.
 */
export function StickyActions({
  children,
  inDialog = false,
  className,
}: {
  children: React.ReactNode;
  inDialog?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 border-t",
        inDialog
          ? "-mx-4 -mb-4 rounded-b-xl bg-popover px-4 py-3"
          : "bg-background/95 py-3 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80",
        className
      )}
      // On a phone the browser's gesture bar sits over the bottom few pixels.
      style={inDialog ? undefined : { paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      {children}
    </div>
  );
}
