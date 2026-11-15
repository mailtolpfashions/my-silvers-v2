import { formatINRPaise } from "@/lib/format";

export type SalesBucket = { key: string; at: number; revenuePaise: number; future: boolean };

const IST = "Asia/Kolkata";

function label(at: number, unit: "hour" | "day") {
  const d = new Date(at);
  return unit === "hour"
    ? d.toLocaleTimeString("en-IN", { hour: "numeric", timeZone: IST })
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: IST });
}

/**
 * Sales per hour (Today) or per day (7 / 30 days), in India time.
 *
 * Server-rendered divs, like the RevenueChart it replaces on the dashboard —
 * no chart library, for the reasons recorded there. Hours still to come today
 * are drawn as a faint outline, so the morning doesn't look like a collapse.
 * See revenue-chart.tsx for the 2px stub and radius notes, which apply here.
 */
export function SalesChart({ buckets, unit }: { buckets: SalesBucket[]; unit: "hour" | "day" }) {
  const max = Math.max(1, ...buckets.map((b) => b.revenuePaise));
  const total = buckets.reduce((s, b) => s + b.revenuePaise, 0);
  const marks = [0, Math.floor(buckets.length / 2), buckets.length - 1];

  return (
    <div>
      <div
        className="flex h-40 items-end gap-0.5"
        role="img"
        aria-label={`Sales ${unit === "hour" ? "by hour today" : "by day"}: ${formatINRPaise(total)} in total.`}
      >
        {buckets.map((b) => (
          <div
            key={b.key}
            title={`${label(b.at, unit)}: ${formatINRPaise(b.revenuePaise)}`}
            style={{ height: b.future ? "100%" : `${(b.revenuePaise / max) * 100}%` }}
            className={`min-h-0.5 flex-1 rounded-t-[2px] ${
              b.future
                ? "border border-dashed border-border bg-transparent"
                : b.revenuePaise > 0
                  ? "bg-primary"
                  : "bg-border"
            }`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
        {marks.map((i) => (
          <span key={i}>{buckets[i] ? label(buckets[i].at, unit) : ""}</span>
        ))}
      </div>
    </div>
  );
}
