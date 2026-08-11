"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { Check, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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

/**
 * Facets beyond category and price, driven by tags that genuinely exist in the
 * catalogue. They filter through `?q=`, because the generated searchVector
 * indexes Product.tags — so this adds facets without touching searchProducts.
 *
 * Deliberately a curated list rather than a tag census: a census surfaces every
 * stray tag an admin ever typed, and a filter panel is a designed surface.
 */
const TAG_FACETS: Array<{ heading: string; options: Array<{ label: string; tag: string }> }> = [
  {
    heading: "Finish",
    options: [
      { label: "Oxidised", tag: "oxidised" },
      { label: "Polished", tag: "polished" },
      { label: "Matte", tag: "matte" },
      { label: "Brushed", tag: "brushed" },
      { label: "Rhodium plated", tag: "rhodium-plated" },
      { label: "Rose gold plated", tag: "rose-gold-plated" },
    ],
  },
  {
    heading: "Occasion",
    options: [
      { label: "Everyday", tag: "everyday" },
      { label: "Office", tag: "office" },
      { label: "Party", tag: "party" },
      { label: "Festive", tag: "festive" },
      { label: "Bridal", tag: "bridal" },
      { label: "Gifting", tag: "gifting" },
    ],
  },
  {
    /**
     * Labelled "Material" because that is literally what it filters.
     *
     * Product.material is "925 Sterling Silver" optionally followed by "with
     * <stone>" — the purity is constant across the whole catalogue (112 of 112
     * products are 925), so the ONLY thing that varies in a material string is
     * the stone. A separate silver/gold facet would offer one option, and a
     * "Stone" heading beside a "Material" heading would be two names for the
     * same column.
     */
    heading: "Material",
    options: [
      { label: "Moonstone", tag: "moonstone" },
      { label: "Turquoise", tag: "turquoise" },
      { label: "Freshwater pearl", tag: "freshwater-pearl" },
      { label: "Cubic zirconia", tag: "cubic-zirconia" },
      { label: "Garnet", tag: "garnet" },
      { label: "Onyx", tag: "onyx" },
    ],
  },
];

/**
 * ── Why there is no Size facet ───────────────────────────────────────────────
 * Size is the one requested facet that cannot be built in the presentation
 * layer. The tag facets above ride on `?q=`, which works because the generated
 * searchVector indexes Product.tags — but sizes live on ProductVariant and are
 * not in that vector, so there is no supported query parameter to drive.
 * Adding one means a `size` argument in searchProducts (src/server/**), which
 * this redesign is not permitted to touch.
 *
 * It is also not obviously wanted at catalogue level: 74 of 112 products carry
 * sizes, and the vocabularies do not overlap — rings are 6–10, chains are
 * 16–22 in, anklets 9–11 in, and some pieces use S/M/L. A single global list
 * mixing "6", "S" and "16 in" would be noise on /products. If it is wanted, it
 * belongs on category pages, where one vocabulary applies, and it needs that
 * server change first.
 */

/** Entered backwards is a typo, not an empty result — swap rather than return nothing. */
function normaliseRange(min: string, max: string): [string, string] {
  const lo = min.trim();
  const hi = max.trim();
  return lo && hi && Number(lo) > Number(hi) ? [hi, lo] : [lo, hi];
}

export type FilterState = {
  category?: string;
  sort?: string;
  minPrice?: string;
  maxPrice?: string;
  q?: string;
};

/**
 * Sort and filters for any product listing.
 *
 * ── One affordance, at every width ───────────────────────────────────────────
 * The desktop presentation used to be an inline row of about eleven controls —
 * a category select, the word "Price", five bucket pills, two number inputs, a
 * Go button, a conditional Clear, then "Sort" and a second select — wrapping
 * across two lines above the grid before a shopper saw a single product. It
 * read as a database query interface.
 *
 * It is now the pattern the phone already had, promoted to every width: a
 * single Filter button opening a panel, a sort control, and a row of removable
 * chips showing what is currently applied. Desktop opens a right-hand drawer;
 * below md the same panel arrives as a bottom sheet from a pinned bar, because
 * on a phone the decision to re-sort is made after scrolling, by which time a
 * row at the top is long gone.
 *
 * Filters buffer in local state and commit on "Show results" — a shopper
 * usually sets a category AND a price, and applying each live would fire two
 * navigations and re-render the grid underneath the open panel. Sort applies
 * immediately, because there is only ever one answer.
 *
 * `categories` is optional so the same component serves a category page, where
 * the category is already decided by the URL and a picker would only offer a
 * way to leave.
 */
export function ProductFilters({
  categories,
  current,
  /** Result count, shown beside the controls rather than under the heading. */
  total,
}: {
  categories?: { slug: string; name: string }[];
  current: FilterState;
  total?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [open, setOpen] = useState(false);
  const [draftCategory, setDraftCategory] = useState(current.category ?? ALL_CATEGORIES);
  const [draftMin, setDraftMin] = useState(current.minPrice ?? "");
  const [draftMax, setDraftMax] = useState(current.maxPrice ?? "");
  const [draftQ, setDraftQ] = useState(current.q ?? "");

  const activeSort = current.sort ?? "newest";

  /** Applies several params at once so one navigation covers the whole change. */
  function updateParams(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value && value !== ALL_CATEGORIES) next.set(key, value);
      else next.delete(key);
    }
    // Any filter change invalidates the current page.
    next.delete("page");
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  /** Reopening must show what the URL says, not last time's abandoned draft. */
  function openPanel(next: boolean) {
    if (next) {
      setDraftCategory(current.category ?? ALL_CATEGORIES);
      setDraftMin(current.minPrice ?? "");
      setDraftMax(current.maxPrice ?? "");
      setDraftQ(current.q ?? "");
    }
    setOpen(next);
  }

  function applyDraft() {
    const [lo, hi] = normaliseRange(draftMin, draftMax);
    updateParams({
      category: draftCategory,
      minPrice: lo || null,
      maxPrice: hi || null,
      q: draftQ || null,
    });
    setOpen(false);
  }

  function clearDraft() {
    setDraftCategory(ALL_CATEGORIES);
    setDraftMin("");
    setDraftMax("");
    setDraftQ("");
  }

  // Sort is excluded on purpose: every listing is sorted by something, so
  // counting it would mean the badge never reads zero.
  const activeCount =
    (current.category ? 1 : 0) +
    (current.minPrice || current.maxPrice ? 1 : 0) +
    (current.q ? 1 : 0);

  const chips = buildChips(current, categories);

  const panel = (
    <FilterPanel
      categories={categories}
      draftCategory={draftCategory}
      setDraftCategory={setDraftCategory}
      draftMin={draftMin}
      setDraftMin={setDraftMin}
      draftMax={draftMax}
      setDraftMax={setDraftMax}
      draftQ={draftQ}
      setDraftQ={setDraftQ}
      onApply={applyDraft}
      onClear={clearDraft}
    />
  );

  return (
    <>
      {/* ── Desktop: one Filter button, a sort control, and the count ──────── */}
      <div className="hidden items-center justify-between gap-6 border-b py-4 md:flex">
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={() => openPanel(true)}
            className="inline-flex items-center gap-2 border-b border-transparent pb-0.5 text-sm transition-colors hover:border-foreground"
          >
            <SlidersHorizontal className="size-4" />
            Filter
            {activeCount > 0 && (
              <span className="text-black">({activeCount})</span>
            )}
          </button>
          {typeof total === "number" && (
            <span className="text-sm text-muted-foreground">
              {total} {total === 1 ? "piece" : "pieces"}
            </span>
          )}
        </div>

        {/* A native select styled down to a text control. A 160px bordered box
            with a chevron reads as a form field; sorting is a preference, not
            data entry. */}
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Sort</span>
          <select
            value={activeSort}
            onChange={(event) => updateParams({ sort: event.target.value })}
            className="cursor-pointer border-b border-transparent bg-transparent py-0.5 pr-1 text-sm outline-none transition-colors hover:border-foreground focus-visible:border-foreground"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* ── Active filters, both breakpoints ───────────────────────────────── */}
      {chips.length > 0 && (
        <ul className="flex flex-wrap items-center gap-2 pt-4">
          {chips.map((chip) => (
            <li key={chip.key}>
              <button
                type="button"
                onClick={() => updateParams(chip.clear)}
                className="inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs transition-colors hover:border-foreground"
              >
                {chip.label}
                <X className="size-3" aria-hidden />
                <span className="sr-only">Remove filter</span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() =>
                updateParams({ category: null, minPrice: null, maxPrice: null, q: null })
              }
              className="px-1 text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
            >
              Clear all
            </button>
          </li>
        </ul>
      )}

      {/* ── Mobile: pinned bar ─────────────────────────────────────────────── */}
      <div className="md:hidden">
        <StickyActionBar>
          {/* `min-w-0 shrink px-4` is load-bearing, not tidying. size="cta"
              carries `px-10 sm:px-14`, and the Button base sets `shrink-0` —
              so two of these in a 390px bar were ~80px of padding each plus
              their labels, and the whole page scrolled sideways. Any cta-sized
              button placed in a flex row must restate its padding and allow
              itself to shrink. */}
          <Button
            type="button"
            variant="cta"
            size="cta"
            className="h-11 min-w-0 flex-1 shrink border border-input bg-background px-4 text-foreground hover:bg-muted sm:px-4"
            onClick={() => openPanel(true)}
          >
            <SlidersHorizontal className="size-4" />
            Filter
            {activeCount > 0 && (
              <span className="ml-1 flex size-5 items-center justify-center bg-foreground text-[11px] text-background">
                {activeCount}
              </span>
            )}
          </Button>

          {/* Sort stays its own control on a phone: it is the more frequent
              action and burying it one level deeper costs a tap every time. */}
          <label className="relative flex h-11 flex-1 items-center justify-center border border-input bg-background text-[13px] uppercase tracking-[0.08em]">
            <span className="pointer-events-none">Sort</span>
            <select
              value={activeSort}
              onChange={(event) => updateParams({ sort: event.target.value })}
              aria-label="Sort products"
              className="absolute inset-0 cursor-pointer opacity-0"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </StickyActionBar>
      </div>

      {/* ── The panel. A right drawer from md, a bottom sheet below. ───────── */}
      <Sheet open={open} onOpenChange={openPanel}>
        <SheetContent
          side="right"
          className="hidden w-full max-w-[26rem] flex-col gap-0 p-0 md:flex"
        >
          <SheetHeader className="border-b px-6 py-5">
            <SheetTitle className="text-h3">Filter</SheetTitle>
            <SheetDescription className="sr-only">
              Narrow the list by category, price and style.
            </SheetDescription>
          </SheetHeader>
          {panel}
        </SheetContent>
      </Sheet>

      <Sheet open={open} onOpenChange={openPanel}>
        <SheetContent
          side="bottom"
          className="flex max-h-[85dvh] flex-col gap-0 p-0 pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          <SheetHeader className="border-b px-5 py-4">
            <SheetTitle className="text-h3">Filter</SheetTitle>
            <SheetDescription className="sr-only">
              Narrow the list by category, price and style.
            </SheetDescription>
          </SheetHeader>
          {panel}
        </SheetContent>
      </Sheet>
    </>
  );
}

/** The panel body, identical in the drawer and the sheet. */
function FilterPanel({
  categories,
  draftCategory,
  setDraftCategory,
  draftMin,
  setDraftMin,
  draftMax,
  setDraftMax,
  draftQ,
  setDraftQ,
  onApply,
  onClear,
}: {
  categories?: { slug: string; name: string }[];
  draftCategory: string;
  setDraftCategory: (v: string) => void;
  draftMin: string;
  setDraftMin: (v: string) => void;
  draftMax: string;
  setDraftMax: (v: string) => void;
  draftQ: string;
  setDraftQ: (v: string) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 py-5 md:px-6">
        {categories && (
          <FacetGroup heading="Category">
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
          </FacetGroup>
        )}

        <FacetGroup heading="Price">
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
        </FacetGroup>

        <div className="-mt-2 mb-8 flex items-center gap-2">
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

        {/* Tag facets are single-select: they ride on `q`, which is one
            full-text query, so two at once would search for both words and
            return almost nothing. Stated here because the single-select
            behaviour looks like an oversight otherwise. */}
        {TAG_FACETS.map((facet) => (
          <FacetGroup key={facet.heading} heading={facet.heading}>
            {facet.options.map((option) => (
              <Chip
                key={option.tag}
                label={option.label}
                active={draftQ === option.tag}
                onClick={() => setDraftQ(draftQ === option.tag ? "" : option.tag)}
              />
            ))}
          </FacetGroup>
        ))}
      </div>

      <div className="flex items-center gap-3 border-t p-4 md:px-6">
        {/* Same padding/shrink note as the pinned bar above. */}
        <Button
          type="button"
          variant="cta"
          size="cta"
          className="h-11 min-w-0 flex-1 shrink border border-input bg-transparent px-4 text-foreground hover:bg-muted sm:h-11 sm:px-4"
          onClick={onClear}
        >
          Clear all
        </Button>
        <Button
          type="button"
          variant="cta"
          size="cta"
          className="h-11 min-w-0 flex-1 shrink px-4 sm:h-11 sm:px-4"
          onClick={onApply}
        >
          Show results
        </Button>
      </div>
    </>
  );
}

function FacetGroup({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h3 className="label-eyebrow mb-3">{heading}</h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

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
      className={`inline-flex items-center gap-1.5 border px-3.5 py-2 text-sm transition-colors ${
        active
          ? "border-foreground bg-foreground text-background"
          : "hover:border-foreground/50"
      }`}
    >
      {label}
      {active && <Check className="size-3.5" aria-hidden />}
    </button>
  );
}

type Chip = { key: string; label: string; clear: Record<string, string | null> };

/** What is currently applied, as removable chips. */
function buildChips(
  current: FilterState,
  categories?: { slug: string; name: string }[]
): Chip[] {
  const chips: Chip[] = [];

  if (current.category) {
    const name = categories?.find((c) => c.slug === current.category)?.name ?? current.category;
    chips.push({ key: "category", label: name, clear: { category: null } });
  }

  if (current.q) {
    chips.push({ key: "q", label: `“${current.q}”`, clear: { q: null } });
  }

  if (current.minPrice || current.maxPrice) {
    const bucket = PRICE_BUCKETS.find((b) =>
      isBucketActive(b, current.minPrice, current.maxPrice)
    );
    const label =
      bucket?.label ??
      // A hand-typed range gets spelled out rather than shown as raw params.
      [
        current.minPrice ? `₹${Number(current.minPrice).toLocaleString("en-IN")}` : "Under",
        current.maxPrice ? `₹${Number(current.maxPrice).toLocaleString("en-IN")}` : "and up",
      ].join(" – ");
    chips.push({ key: "price", label, clear: { minPrice: null, maxPrice: null } });
  }

  return chips;
}
