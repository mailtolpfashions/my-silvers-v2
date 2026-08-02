import { formatINRPaise } from "@/lib/format";
import type { RevenueDay } from "@/server/admin/stats";

/** Dependency-free SVG bar chart of daily revenue for the last 30 days. */
export function RevenueChart({ days }: { days: RevenueDay[] }) {
  const width = 600;
  const height = 160;
  const barGap = 2;
  const barWidth = (width - barGap * (days.length - 1)) / days.length;
  const max = Math.max(1, ...days.map((d) => d.revenuePaise));

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
              <title>{`${d.day}: ${formatINRPaise(d.revenuePaise)}`}</title>
              <rect
                x={i * (barWidth + barGap)}
                y={height - h}
                width={barWidth}
                height={h}
                rx={2}
                className={d.revenuePaise > 0 ? "fill-primary" : "fill-muted"}
              />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{days[0]?.day}</span>
        <span>{days[days.length - 1]?.day}</span>
      </div>
    </div>
  );
}
