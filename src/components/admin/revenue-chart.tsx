import { formatINRPaise, formatShortDay } from "@/lib/format";
import type { RevenueDay } from "@/server/admin/stats";

/**
 * Dependency-free SVG bar chart of daily revenue for the last 30 days.
 *
 * ⚠️  Deliberately NOT Recharts, and the reason is not bundle size — this is an
 * admin page behind a login that already ships plenty of client JavaScript, so
 * a charting library would be affordable here. It is that this stays a SERVER
 * component. Thirty bars of a fixed dataset need no interactivity to draw, so
 * the whole thing arrives as HTML with no hydration and no client bundle at
 * all. Reach for a real charting library the day this needs a brushed range, a
 * second series, or a legend — not for rectangles.
 *
 * The tooltip is a `<title>` element per bar, which browsers render natively on
 * hover. It is slower to appear than a styled tooltip and cannot be themed;
 * that is the honest cost of the choice above, and it is also the one thing a
 * library would most improve.
 */
export function RevenueChart({ days }: { days: RevenueDay[] }) {
  const width = 600;
  const height = 160;
  const barGap = 2;
  const barWidth = (width - barGap * (days.length - 1)) / days.length;
  const max = Math.max(1, ...days.map((d) => d.revenuePaise));

  /**
   * Corner radius, derived rather than fixed.
   *
   * A fixed radius is what makes a dense bar chart look wrong: 6px on a 40px
   * monthly bar is a soft corner, but the same 6px on one of thirty daily bars
   * (~18px here, narrower on a phone) is most of the bar's width and it renders
   * as a blob. Half the bar width is the ceiling where a rect is still a rect.
   */
  const radius = Math.min(3, barWidth / 2);

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-40 w-full"
        role="img"
        aria-label="Daily revenue for the last 30 days"
      >
        {days.map((d, i) => {
          const h = Math.max(d.revenuePaise > 0 ? 3 : 1, (d.revenuePaise / max) * (height - 20));
          return (
            <g key={d.day}>
              <title>{`${formatShortDay(d.day)}: ${formatINRPaise(d.revenuePaise)}`}</title>
              <rect
                x={i * (barWidth + barGap)}
                y={height - h}
                width={barWidth}
                height={h}
                rx={radius}
                className={d.revenuePaise > 0 ? "fill-primary" : "fill-muted"}
              />
            </g>
          );
        })}
      </svg>

      {/* Three marks rather than two. Start and end alone tell you the window
          but not where you are inside it — the midpoint is what lets someone
          place a spike without counting bars. */}
      <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
        <span>{formatShortDay(days[0]?.day)}</span>
        <span>{formatShortDay(days[Math.floor(days.length / 2)]?.day)}</span>
        <span>{formatShortDay(days[days.length - 1]?.day)}</span>
      </div>
    </div>
  );
}

