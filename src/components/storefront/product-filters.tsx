"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowDownUp, Check, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StickyActionBar } from "@/components/storefront/sticky-action-bar";
import { PRICE_BUCKETS, isBucketActive } from "@/lib/price-buckets";

const ALL_CATEGORIES = "__all__";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
];

/** Entered backwards is a typo, not an empty result — swap rather than return nothing. */
function normaliseRange(min: string, max: string): [string, string] {
  const lo = min.trim();
  const hi = max.trim();
  return lo && hi && Number(lo) > Number(hi) ? [hi, lo] : [lo, hi];
}

/**
 * Sort and price filters for any product listing.
 *
 * Two presentations of the same controls. From md up they are an inline row
 * above the grid. Below md they are a fixed Sort / Filter bar at the bottom of
 * the viewport that opens bottom sheets — the row cost four wrapped lines of
 * chrome before a shopper saw a single product, and on a phone the decision to
 * re-sort is made after scrolling, by which time a row at the top is long gone.
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
    const [lo, hi] = normaliseRange(minInput, maxInput);
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
    <>
      {/* ── Desktop: one wrapping row rather than two stacked ones. Everything
          here is a filter, so splitting selects from price buckets read as two
          unrelated controls. ─────────────────────────────────────────────── */}
      <div className="hidden flex-wrap items-center gap-x-3 gap-y-2 md:flex">
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
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <MobileFilterBar
        categories={categories}
        current={current}
        onApply={updateParams}
      />
    </>
  );
}

/**
 * The phone presentation: a pinned Sort / Filter bar, each half opening a
 * bottom sheet.
 *
 * Sort applies on tap and closes — there is only ever one answer, so a
 * confirm step would be a tap for nothing. Filter buffers its choices in
 * local state and commits them on "Show results", because a shopper usually
 * sets a category *and* a price, and applying each one live would fire two
 * navigations and re-render the grid underneath the open sheet.
 */
function MobileFilterBar({
  categories,
  current,
  onApply,
}: {
  categories?: { slug: string; name: string }[];
  current: {
    category?: string;
    sort?: string;
    minPrice?: string;
    maxPrice?: string;
  };
  onApply: (changes: Record<string, string | null>) => void;
}) {
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftCategory, setDraftCategory] = useState(current.category ?? ALL_CATEGORIES);
  const [draftMin, setDraftMin] = useState(current.minPrice ?? "");
  const [draftMax, setDraftMax] = useState(current.maxPrice ?? "");

  const activeSort = current.sort ?? "newest";
  // Sort is excluded on purpose: every listing is sorted by something, so
  // counting it would mean the badge never reads zero.
  const activeCount =
    (current.category ? 1 : 0) + (current.minPrice || current.maxPrice ? 1 : 0);

  /** Reopening must show what the URL says, not last time's abandoned draft. */
  function openFilters(open: boolean) {
    if (open) {
      setDraftCategory(current.category ?? ALL_CATEGORIES);
      setDraftMin(current.minPrice ?? "");
      setDraftMax(current.maxPrice ?? "");
    }
    setFilterOpen(open);
  }

  function applyDraft() {
    const [lo, hi] = normaliseRange(draftMin, draftMax);
    onApply({
      category: draftCategory,
      minPrice: lo || null,
      maxPrice: hi || null,
    });
    setFilterOpen(false);
  }

  function clearDraft() {
    setDraftCategory(ALL_CATEGORIES);
    setDraftMin("");
    setDraftMax("");
  }

  return (
    <>
      <StickyActionBar>
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-1 rounded-full text-base"
          onClick={() => setSortOpen(true)}
        >
          <ArrowDownUp />
          Sort
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-1 rounded-full text-base"
          onClick={() => openFilters(true)}
        >
          <SlidersHorizontal />
          Filter
          {activeCount > 0 && (
            <span className="ml-0.5 flex size-5 items-center justify-center rounded-full bg-foreground text-xs text-background">
              {activeCount}
            </span>
          )}
        </Button>
      </StickyActionBar>

      {/* ── Sort ──────────────────────────────────────────────────────────── */}
      <Sheet open={sortOpen} onOpenChange={setSortOpen}>
        <SheetContent side="bottom" className={SHEET_CLASS}>
          <SheetHeader>
            <SheetTitle>Sort by</SheetTitle>
            <SheetDescription className="sr-only">
              Choose the order products are listed in.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col pb-2">
            {SORT_OPTIONS.map((option) => {
              const active = option.value === activeSort;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onApply({ sort: option.value });
                    setSortOpen(false);
                  }}
                  aria-pressed={active}
                  className={`flex items-center justify-between border-t px-4 py-3.5 text-left text-base ${
                    active ? "font-medium" : "text-muted-foreground"
                  }`}
                >
                  {option.label}
                  {active && <Check className="size-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Filter ────────────────────────────────────────────────────────── */}
      <Sheet open={filterOpen} onOpenChange={openFilters}>
        <SheetContent side="bottom" className={SHEET_CLASS}>
          <SheetHeader>
            <SheetTitle>Filter</SheetTitle>
            <SheetDescription className="sr-only">
              Narrow the list by category and price.
            </SheetDescription>
          </SheetHeader>

          <div className="max-h-[55dvh] overflow-y-auto px-4 pb-2">
            {categories && (
              <section className="mb-6">
                <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Category
                </h3>
                <div className="flex flex-wrap gap-2">
                  <Chip
                    label="All"
                    active={draftCategory === ALL_CATEGORIES}
                    onClick={() => setDraftCategory(ALL_CATEGORIES)}
                  />
                  {categories.map((c) => (
                    <Chip
                      key={c.slug}
                      label={c.name}
                      active={draftCategory === c.slug}
                      onClick={() => setDraftCategory(c.slug)}
                    />
                  ))}
                </div>
              </section>
            )}

            <section>
              <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Price
              </h3>
              <div className="flex flex-wrap gap-2">
                {PRICE_BUCKETS.map((bucket) => {
                  const active = isBucketActive(bucket, draftMin, draftMax);
                  return (
                    <Chip
                      key={bucket.label}
                      label={bucket.label}
                      active={active}
                      onClick={() => {
                        // Tapping the active bucket again clears it.
                        setDraftMin(active || !bucket.min ? "" : String(bucket.min));
                        setDraftMax(active || !bucket.max ? "" : String(bucket.max));
                      }}
                    />
                  );
                })}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <Input
                  value={draftMin}
                  onChange={(e) => setDraftMin(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  placeholder="Min"
                  aria-label="Minimum price"
                  className="h-11 flex-1"
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  value={draftMax}
                  onChange={(e) => setDraftMax(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  placeholder="Max"
                  aria-label="Maximum price"
                  className="h-11 flex-1"
                />
              </div>
            </section>
          </div>

          <div className="flex items-center gap-3 border-t p-4">
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 rounded-full text-base"
              onClick={clearDraft}
            >
              Clear all
            </Button>
            <Button
              type="button"
              className="h-11 flex-1 rounded-full text-base"
              onClick={applyDraft}
            >
              Show results
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

// The sheet is the bottom of the screen, so it carries the gesture-bar inset
// itself — the pinned bar it opens from is hidden behind the overlay.
const SHEET_CLASS =
  "gap-0 rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)] md:hidden";

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-4 py-2 text-sm transition-colors ${
        active ? "border-foreground bg-foreground text-background" : ""
      }`}
    >
      {label}
    </button>
  );
}
