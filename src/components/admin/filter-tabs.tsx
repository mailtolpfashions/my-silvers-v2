import Link from "next/link";

/**
 * The filter row above an admin list.
 *
 * Reviews and Payments each carried their own copy — same markup, same active
 * styling, same count-beside-label pattern, written twice. The third screen
 * that wanted tabs would have made it three.
 *
 * ── The count is part of the control, not decoration ─────────────────────────
 * A tab that says "Hidden" tells you a filter exists. One that says "Hidden 3"
 * tells you whether opening it is worth the click, which is the actual question
 * — and a zero is the most useful number on the row, because it means there is
 * nothing to moderate.
 *
 * A server component: these are links, and nothing here needs the browser.
 */
export function FilterTabs<Key extends string>({
  tabs,
  current,
  hrefFor,
}: {
  tabs: ReadonlyArray<{ key: Key; label: string; count: number }>;
  current: Key;
  hrefFor: (key: Key) => string;
}) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Filter">
      {tabs.map((tab) => {
        const active = tab.key === current;
        return (
          <Link
            key={tab.key}
            href={hrefFor(tab.key)}
            aria-current={active ? "page" : undefined}
            className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors ${
              active
                ? "border-foreground bg-foreground text-background"
                : "hover:bg-muted"
            }`}
          >
            {tab.label}
            <span className={active ? "opacity-70" : "text-muted-foreground"}>{tab.count}</span>
          </Link>
        );
      })}
    </nav>
  );
}
