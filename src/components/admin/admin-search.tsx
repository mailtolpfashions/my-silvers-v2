import Link from "next/link";

/**
 * The search box above an admin list.
 *
 * ── A GET form, deliberately ─────────────────────────────────────────────────
 * No client component, no debounce, no state. Submitting navigates to
 * `?q=...`, which makes a search a URL — linkable, bookmarkable, and something
 * the browser's back button understands. A debounced client search feels
 * fractionally quicker and loses all three.
 *
 * ── Clear is a link, not a button ────────────────────────────────────────────
 * It is a navigation to the unfiltered list. Rendering it as a button would
 * mean JavaScript, and it would stop being middle-clickable.
 *
 * Hidden inputs carry any other filters through, so searching inside a filtered
 * view does not silently reset the filter — the bug this component exists to
 * make impossible to write twice.
 */
export function AdminSearch({
  action,
  placeholder,
  value,
  /** Other query params to preserve, as name → value. */
  keep = {},
  className = "",
}: {
  action: string;
  placeholder: string;
  value?: string;
  keep?: Record<string, string | undefined>;
  className?: string;
}) {
  const entries = Object.entries(keep).filter(([, v]) => v);

  return (
    <form action={action} className={`flex gap-2 ${className}`}>
      {entries.map(([name, v]) => (
        <input key={name} type="hidden" name={name} value={v} />
      ))}
      <input
        name="q"
        defaultValue={value ?? ""}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 text-sm"
      />
      {value && (
        <Link
          href={action}
          className="inline-flex h-9 shrink-0 items-center rounded-md border px-3 text-sm hover:bg-muted"
        >
          Clear
        </Link>
      )}
    </form>
  );
}
