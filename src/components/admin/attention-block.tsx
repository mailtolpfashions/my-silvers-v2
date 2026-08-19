import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { AttentionItem } from "@/server/admin/attention";

/**
 * The work waiting, at the top of the dashboard.
 *
 * ── It replaces a single pill ────────────────────────────────────────────────
 * The dashboard used to surface exactly one actionable thing — pending returns
 * — as a pill beside the title, because that was the only one it knew about.
 * Six sections later there are seven, and a row of pills would be worse than a
 * list. Returns is now one row here rather than two places on one page.
 *
 * ── Nothing here is a metric ─────────────────────────────────────────────────
 * Every row is a count that is also a destination. Anything you cannot act on
 * by clicking belongs in the stat cards below.
 *
 * ── Empty means nothing to do, and says so once ──────────────────────────────
 * Zero-count items are filtered out upstream, so an empty list is a real
 * all-clear rather than a row of zeroes. One quiet line beats seven.
 */
export function AttentionBlock({
  items,
  cartSlot,
}: {
  items: AttentionItem[];
  /**
   * The abandoned-cart row, streamed separately — it is the one query here
   * expensive enough to hold the rest up. See getAbandonedCartSummary.
   */
  cartSlot?: React.ReactNode;
}) {
  if (items.length === 0 && !cartSlot) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing needs attention — stock, payments and reviews are all clear.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <AttentionLink
          key={item.key}
          href={item.href}
          label={item.label(item.count)}
          urgent={item.urgent}
        />
      ))}
      {cartSlot}
    </div>
  );
}

/**
 * One row of work.
 *
 * Urgent items use the admin surface's warning pair rather than a one-off
 * amber, so they match every other warning in the panel. The arrow is what
 * makes it read as a destination rather than a badge — the whole point is that
 * these are clickable.
 */
export function AttentionLink({
  href,
  label,
  urgent = false,
}: {
  href: string;
  label: string;
  urgent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
        urgent
          ? "border-transparent state-pill"
          : "hover:bg-muted"
      }`}
      data-state={urgent ? "warning" : undefined}
    >
      {label}
      <ArrowRight className="size-3.5 opacity-60 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
