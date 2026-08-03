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

export function ProductFilters({
  categories,
  current,
}: {
  categories: { slug: string; name: string }[];
  current: {
    q?: string;
    category?: string;
    sort?: string;
    minPrice?: string;
    maxPrice?: string;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(current.q ?? "");
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
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateParams({ q });
          }}
          className="flex-1"
        >
          <Input
            placeholder="Search products…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </form>

        <Select
          value={current.category ?? ALL_CATEGORIES}
          onValueChange={(value) => updateParams({ category: value })}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
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

        <Select
          value={current.sort ?? "newest"}
          onValueChange={(value) => updateParams({ sort: value })}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
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

      {/* ── Price ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Price</span>

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
      </div>
    </div>
  );
}
