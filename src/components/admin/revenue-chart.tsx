import { formatINRPaise, formatShortDay } from "@/lib/format";
import type { RevenueDay } from "@/server/admin/stats";

/**
 * Dependency-free bar chart of daily revenue for the last 30 days.
 *
 * ⚠️  Deliberately NOT Recharts, and the reason is not bundle size — this is an
 * admin page behind a login that already ships plenty of client JavaScript, so
 * a charting library would be affordable here. It is that this stays a SERVER
 * component. Thirty bars of a fixed dataset need no interactivity to draw, so
 * the whole thing arrives as HTML with no hydration and no client bundle at
 * all. Reach for a real charting library the day this needs a brushed range, a
 * second series, or a legend — not for rectangles.
 *
 * ── Flexbox, not SVG, and that is a bug fix ─────────────────────────────────
 * This drew into `<svg viewBox="0 0 600 160" class="h-40 w-full">`, which does
 * not do what it looks like it does. `preserveAspectRatio` defaults to `meet`,
 * so the drawing scales to FIT the box and is then centred — in a card ~1600px
 * wide it rendered at its natural 600px with empty space either side, while the
 * date labels underneath (a separate, full-width row) ran to the card's edges.
 * The axis and the bars it labelled were describing different widths.
 *
 * Divs have none of that: each bar is `flex-1`, so thirty of them always span
 * exactly the container the labels span. Rounded corners stay round, too —
 * under `preserveAspectRatio="none"`, the obvious one-attribute fix, a uniform
 * `rx` stretches into an ellipse.
 *
 * The tooltip is a `title` attribute per bar, which browsers render natively on
 * hover. It is slower to appear than a styled tooltip and cannot be themed;
 * that is the honest cost of staying server-rendered, and it is also the one
 * thing a charting library would most improve.
 */
export function RevenueChart({ days }: { days: RevenueDay[] }) {
  const max = Math.max(1, ...days.map((d) => d.revenuePaise));

  return (
    <div>
      <div
        className="flex h-40 items-end gap-0.5"
        role="img"
        aria-label={`Daily revenue for the last 30 days. Highest day ${formatINRPaise(max)}.`}
      >
        {days.map((d) => (
          <div
            key={d.day}
            title={`${formatShortDay(d.day)}: ${formatINRPaise(d.revenuePaise)}`}
            style={{ height: `${(d.revenuePaise / max) * 100}%` }}
            /**
             * min-h matters more than it looks. A day with no sales is 0% tall
             * and would simply not be drawn — on a month with three good days
             * and twenty-seven quiet ones, that leaves three marks floating in
             * white space with nothing to read them against. The 2px stub gives
             * every day a footprint, so the quiet days form a baseline and the
             * chart says "mostly quiet" rather than looking broken.
             */
            /**
             * ⚠️  A literal 2px, NOT `rounded-t-sm`. This theme redefines the
             * radius scale — `--radius-sm` is `--radius * 0.6`, so it resolves
             * to 7.2px rather than the 2px it means in stock Tailwind. Thirty
             * bars across a phone are about 10px wide each, and a 7.2px radius
             * on a 10px bar is most of a semicircle: the bars stop reading as
             * bars. The width here is decided by flexbox at paint time, so it
             * cannot be derived — it has to be small enough for the narrowest
             * case, which is the mobile one.
             */
            className={`min-h-0.5 flex-1 rounded-t-[2px] ${
              d.revenuePaise > 0 ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>

      {/* Three marks rather than two. Start and end alone tell you the window
          but not where you are inside it — the midpoint is what lets someone
          place a spike without counting bars. Shares the chart's exact width,
          which is the whole point of the flexbox rewrite above. */}
      <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
        <span>{formatShortDay(days[0]?.day)}</span>
        <span>{formatShortDay(days[Math.floor(days.length / 2)]?.day)}</span>
        <span>{formatShortDay(days[days.length - 1]?.day)}</span>
      </div>
    </div>
  );
}
