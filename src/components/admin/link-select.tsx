"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * A dropdown whose options are links — picking one navigates. For filters with
 * too many values to show as chips (one per staff member, say): the URL stays
 * the source of truth, so back/forward and shared links work as they do with
 * the chip filters beside it.
 */
export function LinkSelect({
  label,
  value,
  options,
}: {
  /** Read by screen readers; the first option usually says it visibly too. */
  label: string;
  /** The href currently selected. */
  value: string;
  options: Array<{ label: string; href: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <select
      aria-label={label}
      value={value}
      disabled={isPending}
      onChange={(e) => {
        const href = e.target.value;
        startTransition(() => router.push(href));
      }}
      className="h-8 max-w-full rounded-md border border-input bg-background px-2.5 text-sm"
    >
      {options.map((o) => (
        <option key={o.href} value={o.href}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
