"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBulkSelect } from "@/components/admin/bulk-select";
import {
  setProductsActiveAction,
  setProductsCategoryAction,
  setProductsFlagAction,
  setProductsOfferAction,
  setProductsTagAction,
} from "@/actions/admin-product-actions";

type Category = { id: string; name: string };
/** Which prompt is open. Only one can be, so this is a single value. */
type Prompt = null | "add-tag" | "remove-tag" | "offer";

/**
 * The bar that appears once rows are ticked.
 *
 * Sticky at the foot of the table rather than fixed to the window: it belongs
 * to the table, not the page, and must not sit over the sidebar.
 *
 * ── Menus, not a row of buttons ─────────────────────────────────────────────
 * There are eight operations here. Laid out flat they wrap onto three lines on
 * a laptop and the two that matter — archive and restore — stop being findable.
 * Grouping by what the action DOES keeps the bar one line and puts the
 * destructive-ish ones behind a deliberate second click.
 *
 * ── What is NOT here ────────────────────────────────────────────────────────
 * Bulk delete. It is the only operation with no undo, and a mis-click with
 * twenty rows ticked is unrecoverable. Archiving hides a product from the
 * storefront and is reversible from this same bar, which covers the real need.
 */
export function ProductBulkBar({
  categories,
  variant = "header",
}: {
  categories: Category[];
  /**
   * Only `header` is used.
   *
   * There was briefly a `bar` variant too — a sticky strip under the table
   * carrying the same five controls — on the reasoning that a 24-row table
   * makes you scroll back to the top to act on a selection. In practice it put
   * two identical toolbars on one screen, which is a worse problem than the
   * scroll. The variant is kept because the argument for it is real and may
   * come back on a longer table; if it does, only ONE should render.
   */
  variant?: "bar" | "header";
}) {
  const { selected, clear } = useBulkSelect();
  const [isPending, startTransition] = useTransition();
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [tag, setTag] = useState("");
  const [percent, setPercent] = useState("10");

  const count = selected.size;
  if (count === 0) return null;

  // `header` renders the same controls inline beside the page's own buttons,
  // with no sticky bar and no count — the header shows "Export 3 as CSV", so
  // repeating "3 selected" next to it would say it twice.

  /**
   * Runs an action and reports what the SERVER changed, not what was asked
   * for. The two differ when a row was archived, retagged or deleted by someone
   * else in the meantime, and that discrepancy is worth seeing rather than
   * hiding behind a cheerful "Done".
   */
  function run(
    fn: (ids: string[]) => Promise<{ ok: boolean; error?: string; count?: number }>,
    describe: (n: number, asked: number) => string
  ) {
    const ids = [...selected];
    startTransition(async () => {
      const result = await fn(ids);
      if (!result.ok) {
        toast.error(result.error ?? "That didn't work.");
        return;
      }
      toast.success(describe(result.count ?? ids.length, ids.length));
      setPrompt(null);
      clear();
    });
  }

  const plural = (n: number) => `${n} product${n === 1 ? "" : "s"}`;

  /** The controls themselves, identical in both placements. */
  const controls = (
    <div className="flex flex-wrap items-center gap-2">
            {/* ── Organise: tags and category ── */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={isPending}>
                  Organise <ChevronDown className="size-3.5" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onSelect={() => setPrompt("add-tag")}>
                  Add a tag…
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setPrompt("remove-tag")}>
                  Remove a tag…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Move to category
                </DropdownMenuLabel>
                {categories.map((category) => (
                  <DropdownMenuItem
                    key={category.id}
                    onSelect={() =>
                      run(
                        (ids) => setProductsCategoryAction(ids, category.id),
                        (n) => `${plural(n)} moved to ${category.name}.`
                      )
                    }
                  >
                    {category.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* ── Merchandising: the two homepage flags ── */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={isPending}>
                  Merchandising <ChevronDown className="size-3.5" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {(
                  [
                    ["isFeatured", true, "Mark as featured"],
                    ["isFeatured", false, "Remove featured"],
                    ["isBestseller", true, "Mark as bestseller"],
                    ["isBestseller", false, "Remove bestseller"],
                  ] as const
                ).map(([flag, value, label]) => (
                  <DropdownMenuItem
                    key={label}
                    onSelect={() =>
                      run(
                        (ids) => setProductsFlagAction(ids, flag, value),
                        (n) => `${plural(n)} updated.`
                      )
                    }
                  >
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* ── Offers ── */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={isPending}>
                  Offer <ChevronDown className="size-3.5" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onSelect={() => setPrompt("offer")}>
                  Apply a discount…
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    run(
                      (ids) => setProductsOfferAction(ids, null),
                      (n) => (n === 0 ? "None of those were on offer." : `Offer cleared on ${plural(n)}.`)
                    )
                  }
                >
                  Clear offer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* No Export here. It briefly lived in this bar as well as the
                page header, which put two buttons reading "Export" on one
                screen doing different things. The header's pair now follows the
                selection instead — see ProductExportButtons. */}
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() =>
                run(
                  (ids) => setProductsActiveAction(ids, true),
                  (n, asked) =>
                    n === asked ? `${plural(n)} restored.` : `${n} of ${asked} restored — the rest had changed.`
                )
              }
            >
              Restore
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() =>
                run(
                  (ids) => setProductsActiveAction(ids, false),
                  (n, asked) =>
                    n === asked ? `${plural(n)} archived.` : `${n} of ${asked} archived — the rest had changed.`
                )
              }
      >
        Archive
      </Button>
    </div>
  );

  return (
    <>
      {variant === "header" ? (
        controls
      ) : (
        // -mb-* as well as -mx-*, cancelling `main`'s padding on all three
        // sides. Without it a band of background sat under the bar at the
        // bottom of the page — the same defect the save bar had.
        <div className="sticky bottom-0 z-10 -mx-4 -mb-4 border-t bg-background/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:-mb-6 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium">
              {count} selected
              <button
                type="button"
                onClick={clear}
                className="ml-3 font-normal text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Clear
              </button>
            </p>
            {controls}
          </div>
        </div>
      )}

      {/* ── The three operations that need a value ──────────────────────────
          Rendered by BOTH placements, which is safe because only one instance
          can have `prompt` set — each holds its own state and the other's
          dialog stays closed. */}
      <Dialog open={prompt !== null} onOpenChange={(open) => !open && setPrompt(null)}>
        <DialogContent className="sm:max-w-md">
          {prompt === "offer" ? (
            <>
              <DialogHeader>
                <DialogTitle>Apply a discount</DialogTitle>
                <DialogDescription>
                  The current price becomes the struck-through original on {plural(count)}.
                  Running this twice does not compound — the discount is always taken off the
                  original.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="bulk-percent">Discount (%)</Label>
                <Input
                  id="bulk-percent"
                  type="number"
                  min={1}
                  max={90}
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setPrompt(null)} disabled={isPending}>
                  Cancel
                </Button>
                <Button
                  disabled={isPending}
                  onClick={() =>
                    run(
                      (ids) => setProductsOfferAction(ids, Number(percent)),
                      (n) => `${percent}% off ${plural(n)}.`
                    )
                  }
                >
                  Apply
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>
                  {prompt === "add-tag" ? "Add a tag" : "Remove a tag"}
                </DialogTitle>
                <DialogDescription>
                  Collections are built from tags — a collection shows every product carrying
                  the tag it names. Applies to {plural(count)}.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="bulk-tag">Tag</Label>
                <Input
                  id="bulk-tag"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  placeholder="bridal"
                  autoComplete="off"
                />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setPrompt(null)} disabled={isPending}>
                  Cancel
                </Button>
                <Button
                  disabled={isPending || !tag.trim()}
                  onClick={() =>
                    run(
                      (ids) => setProductsTagAction(ids, tag, prompt === "add-tag" ? "add" : "remove"),
                      (n) =>
                        n === 0
                          ? prompt === "add-tag"
                            ? "They all had that tag already."
                            : "None of those had that tag."
                          : `${plural(n)} ${prompt === "add-tag" ? "tagged" : "untagged"} “${tag.trim().toLowerCase()}”.`
                    )
                  }
                >
                  {prompt === "add-tag" ? "Add tag" : "Remove tag"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
