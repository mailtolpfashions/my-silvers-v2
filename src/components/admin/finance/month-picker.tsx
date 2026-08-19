"use client";

import { useRouter } from "next/navigation";

/**
 * Which month the finance page is showing.
 *
 * A native month input rather than two selects: it is one control, it validates
 * itself, and it is the only date field on this screen that a partner will use
 * repeatedly.
 *
 * Pushes to a `?m=YYYY-MM` search param rather than holding state, so a month
 * can be linked to and sent to the other partners — which is the whole point of
 * a figure people argue about.
 */
export function MonthPicker({ year, monthIndex }: { year: number; monthIndex: number }) {
  const router = useRouter();
  const value = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Month</span>
      <input
        type="month"
        value={value}
        onChange={(e) => {
          // An empty value means the field was cleared; leave the page where it
          // is rather than navigating to an unparseable param.
          if (e.target.value) router.push(`/admin/finance?m=${e.target.value}`);
        }}
        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
      />
    </label>
  );
}
