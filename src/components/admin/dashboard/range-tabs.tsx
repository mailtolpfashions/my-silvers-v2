import Link from "next/link";
import { RANGE_LABELS, type DashboardRange } from "@/server/admin/dashboard";

/**
 * Today · 7 days · 30 days. Plain links (?range=), so the page stays
 * server-rendered, a choice survives a refresh, and a link to "this week" can
 * be shared with a partner.
 */
export function RangeTabs({ current, tab }: { current: DashboardRange; tab: string }) {
  const ranges: Array<[DashboardRange, string]> = [
    ["today", "Today"],
    ["7d", "7 days"],
    ["30d", "30 days"],
  ];
  return (
    <nav aria-label="Period" className="inline-flex rounded-md border bg-card p-0.5">
      {ranges.map(([value, short]) => {
        const params = new URLSearchParams();
        if (value !== "today") params.set("range", value);
        if (tab !== "all") params.set("tab", tab);
        const href = `/admin${params.size ? `?${params}` : ""}`;
        const active = value === current;
        return (
          <Link
            key={value}
            href={href}
            aria-current={active ? "page" : undefined}
            title={RANGE_LABELS[value].label}
            className={`rounded px-3 py-1.5 text-sm transition-colors ${
              active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {short}
          </Link>
        );
      })}
    </nav>
  );
}
