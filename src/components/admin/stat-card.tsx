import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StatTrend } from "@/server/admin/stats";

/**
 * One figure on the dashboard, with an optional direction against the previous
 * period.
 *
 * The four cards used to be a label and a number and nothing else, which tells
 * you the size of something but not whether it is going anywhere — the question
 * anyone opening a dashboard is actually asking.
 *
 * ── The percentage is suppressed more often than you would expect ───────────
 * Growth from zero is not a percentage, it is a first sale. `previous === 0`
 * therefore shows the direction and the words "no data" rather than the
 * infinity that `(c - p) / p` produces, and a period where both are zero shows
 * nothing at all rather than "0%", which would imply a measurement was taken.
 *
 * ── Colour is never the only signal ─────────────────────────────────────────
 * Each direction carries an arrow as well as a hue, per the note on the admin
 * palette. A green number and a red number that differ only in colour are
 * unreadable to a substantial minority.
 */
export function StatCard({
  label,
  value,
  trend,
  /** Formats the delta — revenue needs currency, counts do not. */
  format,
}: {
  label: string;
  value: string;
  trend?: StatTrend;
  format?: (n: number) => string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {trend && <TrendLine trend={trend} format={format} />}
      </CardContent>
    </Card>
  );
}

function TrendLine({ trend, format }: { trend: StatTrend; format?: (n: number) => string }) {
  const { current, previous } = trend;

  // Nothing happened in either period. A "0%" here would claim a comparison
  // that was never possible.
  if (current === 0 && previous === 0) {
    return <p className="mt-1 text-xs text-muted-foreground">No activity in 60 days</p>;
  }

  const diff = current - previous;
  const flat = diff === 0;
  const up = diff > 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;

  const tone = flat
    ? "text-muted-foreground"
    : up
      ? "text-[var(--state-success-fg)]"
      : "text-[var(--state-danger-fg)]";

  const magnitude =
    previous === 0
      ? "no prior data"
      : `${Math.abs(Math.round((diff / previous) * 100))}%`;

  return (
    <p className={`mt-1 flex items-center gap-1 text-xs ${tone}`}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span>
        {flat ? "No change" : magnitude}
        <span className="text-muted-foreground">
          {" "}
          vs previous 30 days
          {format && !flat && previous !== 0 ? ` (${format(Math.abs(diff))})` : ""}
        </span>
      </span>
    </p>
  );
}
