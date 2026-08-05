"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PRICE_BUCKETS, isBucketActive } from "@/lib/price-buckets";

const ALL_CATEGORIES = "__all__";

/**
 * Sort and price filters for any product listing.
 *
 * The product search box that used to live here is gone: the header carries a
 * typeahead search on every page, and two search inputs a few hundred pixels
 * apart is a question the shopper shouldn't have to answer.
 *
 * `categories` is optional so the same component serves a category page, where
 * the category is already decided by the URL and a picker would only offer a
 * way to leave.
 */
export function ProductFilters({
  categories,
  current,
}: {
  categories?: { slug: string; name: string }[];
  current: {
    category?: string;
    sort?: string;
    minPrice?: string;
    maxPrice?: string;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [minInput, setMinInput] = useState(current.minPrice ?? "");
  const [maxInput, setMaxInput] = useState(current.maxPrice ?? "");

  /** Applies several params at once so one navigation covers the whole change. */
  function updateParams(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value && value !== ALL_CATEGORIES) next.set(key, value);
      else next.delete(key);
    }
    // Any filter change invalidates the current page.
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  }

  const hasPriceFilter = Boolean(current.minPrice || current.maxPrice);

  function applyCustomRange() {
    const min = minInput.trim();
    const max = maxInput.trim();
    // Swap if entered backwards rather than returning nothing.
    const [lo, hi] =
      min && max && Number(min) > Number(max) ? [max, min] : [min, max];
    setMinInput(lo);
    setMaxInput(hi);
    updateParams({ minPrice: lo || null, maxPrice: hi || null });
  }

  function clearPrice() {
    setMinInput("");
    setMaxInput("");
    updateParams({ minPrice: null, maxPrice: null });
  }

  return (
    // One wrapping row rather than two stacked ones. Everything here is a
    // filter, so splitting selects from price buckets read as two unrelated
    // controls; flex-wrap keeps it honest on narrow screens.
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {categories && (
          <Select
            value={current.category ?? ALL_CATEGORIES}
            onValueChange={(value) => updateParams({ category: value })}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.slug} value={c.slug}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* ── Price ───────────────────────────────────────────────────────── */}
        <span className="ml-1 text-sm text-muted-foreground">Price</span>

        {PRICE_BUCKETS.map((bucket) => {
          const active = isBucketActive(bucket, current.minPrice, current.maxPrice);
          return (
            <button
              key={bucket.label}
              type="button"
              onClick={() => {
                setMinInput(bucket.min ? String(bucket.min) : "");
                setMaxInput(bucket.max ? String(bucket.max) : "");
                updateParams({
                  // Tapping the active bucket again clears it.
                  minPrice: active || !bucket.min ? null : String(bucket.min),
                  maxPrice: active || !bucket.max ? null : String(bucket.max),
                });
              }}
              aria-pressed={active}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                active
                  ? "border-foreground bg-foreground text-background"
                  : "hover:border-foreground/40"
              }`}
            >
              {bucket.label}
            </button>
          );
        })}

        <div className="flex items-center gap-1.5">
          <Input
            value={minInput}
            onChange={(e) => setMinInput(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && applyCustomRange()}
            inputMode="numeric"
            placeholder="Min"
            aria-label="Minimum price"
            className="h-9 w-20"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            value={maxInput}
            onChange={(e) => setMaxInput(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && applyCustomRange()}
            inputMode="numeric"
            placeholder="Max"
            aria-label="Maximum price"
            className="h-9 w-20"
          />
          <Button type="button" variant="outline" size="sm" onClick={applyCustomRange}>
            Go
          </Button>
        </div>

        {hasPriceFilter && (
          <Button type="button" variant="ghost" size="sm" onClick={clearPrice}>
            <X className="size-3.5" />
            Clear
          </Button>
        )}

        {/* Sort comes after every filter, and right-aligns from sm up. Sorting
            is a different act from filtering — it reorders what you already
            narrowed down — so it reads better separated from the controls that
            decide what's in the list at all. */}
        <div className="flex items-center gap-2 sm:ml-auto">
          <span className="text-sm text-muted-foreground">Sort</span>
          <Select
            value={current.sort ?? "newest"}
            onValueChange={(value) => updateParams({ sort: value })}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="featured">Featured</SelectItem>
              <SelectItem value="price-asc">Price: Low to High</SelectItem>
              <SelectItem value="price-desc">Price: High to Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
    </div>
  );
}
