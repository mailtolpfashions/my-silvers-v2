import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/**
 * The heading block at the top of an admin or Studio page: title, an optional
 * line of context, and the page's primary actions.
 *
 * Every page was hand-rolling this — `flex flex-wrap items-center
 * justify-between gap-3` with an `h1` and a cluster of buttons, repeated with
 * small differences in gap, wrapping and heading size across fourteen files. So
 * the pages did not quite line up with each other, and a change to the pattern
 * meant fourteen edits.
 *
 * `description` is for something a person could not infer from the title — what
 * a screen is for, or a caveat about the data. "Manage your products" under a
 * heading that says Products is noise; leave it out.
 */
export function PageHeader({
  title,
  description,
  backHref,
  backLabel = "Back",
  actions,
}: {
  title: string;
  description?: string;
  /**
   * Shows a back link above the title.
   *
   * The breadcrumb already offers this route, and on a wide screen that is
   * enough. This is for the phone, where the breadcrumb truncates to fit a
   * 390px bar and the parent link is the first thing to go — leaving the
   * browser's own back button as the only way up.
   */
  backHref?: string;
  backLabel?: string;
  /** Buttons, right-aligned on one line and wrapping under the title on a phone. */
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {backHref && (
          <Link
            href={backHref}
            className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden />
            {backLabel}
          </Link>
        )}
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && (
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
