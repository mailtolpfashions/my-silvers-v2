"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Sort, on its own, for a collection page.
 *
 * Collections had no sorting at all. They also have no category or price
 * filtering worth offering — a collection IS the filter, and the sets are small
 * — so the full ProductFilters panel would be a button that opens a mostly
 * empty drawer. This is the one control that page actually needs.
 *
 * Styled as a text control rather than a bordered select: sorting is a
 * preference, not data entry.
 */
const SORT_OPTIONS = [
  { value: "curated", label: "Curated" },
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
];

export function CollectionSort({ current }: { current?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function change(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    // "curated" is the natural order — represent it by the absence of a param
    // rather than by a value, so the default URL stays clean.
    if (value === "curated") next.delete("sort");
    else next.set("sort", value);
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Sort</span>
      <select
        value={current ?? "curated"}
        onChange={(event) => change(event.target.value)}
        className="cursor-pointer border-b border-transparent bg-transparent py-0.5 pr-1 text-sm outline-none transition-colors hover:border-foreground focus-visible:border-foreground"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
