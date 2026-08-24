"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Which month the finance page is showing.
 *
 * ── Two shortcuts and a picker, in that order ────────────────────────────────
 * "This month" and "last month" are the two selections anyone makes almost
 * every time — one to see where the month is going, one to settle up. Both
 * required opening a date picker and reading a calendar. They are links now,
 * and the picker stays for the rarer case of looking further back.
 *
 * The shortcuts are computed on the CLIENT, from the browser's clock. That is
 * correct here rather than sloppy: the server's idea of "this month" is its own
 * timezone, and a partner in India opening this on the 1st should get their
 * month, not the host's.
 *
 * Pushes to a `?m=YYYY-MM` search param rather than holding state, so a month
 * can be linked and sent to the other partners — which is the whole point of a
 * figure people compare notes on.
 */
function monthParam(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function MonthPicker({
  year,
  monthIndex,
  sort,
  dir,
}: {
  year: number;
  monthIndex: number;
  /**
   * The partner table's sort state, carried through every month change.
   *
   * Without it, changing month silently resets the table to its default order
   * while the person is looking at the figures rather than at the header.
   */
  sort?: string;
  dir?: string;
}) {
  const router = useRouter();
  const value = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

  /** `/admin/finance?m=…`, with the chosen sort preserved. */
  const hrefFor = (month: string) => {
    const query = new URLSearchParams({ m: month });
    if (sort) query.set("sort", sort);
    if (dir) query.set("dir", dir);
    return `/admin/finance?${query.toString()}`;
  };

  const now = new Date();
  const thisMonth = monthParam(now);
  const lastMonth = monthParam(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Shortcut target={thisMonth} current={value} label="This month" hrefFor={hrefFor} />
      <Shortcut target={lastMonth} current={value} label="Last month" hrefFor={hrefFor} />

      <label className="flex items-center gap-2 text-sm">
        <span className="sr-only">Month</span>
        <input
          type="month"
          value={value}
          onChange={(e) => {
            // An empty value means the field was cleared; stay where we are
            // rather than navigating to an unparseable param.
            if (e.target.value) router.push(hrefFor(e.target.value));
          }}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        />
      </label>
    </div>
  );
}

/** A link, not a button: each shortcut is a real URL worth sending to someone. */
function Shortcut({
  target,
  current,
  label,
  hrefFor,
}: {
  target: string;
  current: string;
  label: string;
  hrefFor: (month: string) => string;
}) {
  const active = target === current;
  return (
    <Link
      href={hrefFor(target)}
      aria-current={active ? "page" : undefined}
      className={`inline-flex h-9 items-center rounded-md border px-3 text-sm transition-colors ${
        active ? "border-foreground bg-foreground text-background" : "hover:bg-muted"
      }`}
    >
      {label}
    </Link>
  );
}
