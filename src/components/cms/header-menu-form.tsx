"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveHeaderMenuAction } from "@/actions/header-menu-actions";

type CollectionOption = { slug: string; title: string };

/** One header-menu link as edited here: a label, and the words it searches. */
type NavRow = { label: string; query: string };

/**
 * An ordered, editable list of header-menu links.
 *
 * The search word follows the label as it is typed ("Rose gold" → "rose
 * gold") until the admin edits the search word themselves — most rows want
 * exactly that, and the ones that do not ("Rhodium plated" searching
 * "rhodium") are one edit away. Nothing is filled in silently on save: what
 * is in the boxes is what gets published.
 */
function NavListEditor({
  id,
  title,
  description,
  rows,
  onChange,
  disabled,
  placeholder,
  collections,
}: {
  id: string;
  title: string;
  description: string;
  rows: NavRow[];
  onChange: (rows: NavRow[]) => void;
  disabled?: boolean;
  placeholder: string;
  /**
   * When given, each row links to one of these collections, picked from a
   * list, instead of searching for a typed word. A list rather than a slug box
   * because a mistyped slug is a link to nowhere.
   */
  collections?: CollectionOption[];
}) {
  const update = (i: number, patch: Partial<NavRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const move = (i: number, by: -1 | 1) => {
    const next = [...rows];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    onChange(next);
  };

  return (
    <div className="border-b py-5">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">{description}</p>

      {rows.length === 0 ? (
        <p className="mb-3 text-sm text-muted-foreground">
          Empty — this column is hidden from the menu.
        </p>
      ) : (
        <div className="mb-3 space-y-2">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs text-muted-foreground">
            <span>Shown in menu</span>
            <span>{collections ? "Opens collection" : "Searches for"}</span>
            <span className="w-[7.5rem]" />
          </div>
          {rows.map((row, i) => (
            // Index as key: rows have no id, and keying on the label would
            // remount the input on every keystroke and drop focus.
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
              <Input
                id={i === 0 ? `${id}-label` : undefined}
                aria-label={`${title} ${i + 1}: label`}
                value={row.label}
                placeholder={placeholder}
                maxLength={40}
                disabled={disabled}
                onChange={(e) => {
                  const label = e.target.value;
                  if (collections) return update(i, { label });
                  // Follow the label only while the search word still matches
                  // what following would have produced — i.e. untouched.
                  const following = row.query === row.label.trim().toLowerCase();
                  update(i, following ? { label, query: label.trim().toLowerCase() } : { label });
                }}
              />
              {collections ? (
                <select
                  aria-label={`${title} ${i + 1}: collection`}
                  value={row.query}
                  disabled={disabled}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  onChange={(e) => {
                    const picked = collections.find((c) => c.slug === e.target.value);
                    // An empty label takes the collection's title, the common
                    // case; one already typed is left alone.
                    update(i, {
                      query: e.target.value,
                      ...(!row.label.trim() && picked ? { label: picked.title } : {}),
                    });
                  }}
                >
                  <option value="">Choose a collection…</option>
                  {/* A saved slug whose collection has since been unpublished
                      stays selectable, labelled, so saving doesn't silently
                      drop it — the menu already hides it. */}
                  {row.query && !collections.some((c) => c.slug === row.query) && (
                    <option value={row.query}>{row.query} (not published)</option>
                  )}
                  {collections.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.title}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  aria-label={`${title} ${i + 1}: search word`}
                  value={row.query}
                  maxLength={60}
                  disabled={disabled}
                  onChange={(e) => update(i, { query: e.target.value })}
                />
              )}
              <div className="flex w-[7.5rem] justify-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Move up"
                  disabled={disabled || i === 0}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Move down"
                  disabled={disabled || i === rows.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${row.label || "row"}`}
                  disabled={disabled}
                  onClick={() => onChange(rows.filter((_, j) => j !== i))}
                >
                  ✕
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || rows.length >= 12}
        onClick={() => onChange([...rows, { label: "", query: "" }])}
      >
        Add link
      </Button>
    </div>
  );
}

export type HeaderMenuValues = {
  navShopFor: NavRow[];
  navFinishes: NavRow[];
  navOccasions: NavRow[];
};

/**
 * Studio → Header menu. Moved here from the owner's Settings (Nov 2026): it is
 * storefront content, edited as often as collections and the announcement
 * bar, by anyone who edits content — not a business switch. Saving refreshes
 * the header on every page straight away.
 */
export function HeaderMenuForm({
  initial,
  collections,
}: {
  initial: HeaderMenuValues;
  /** Published collections, for the "Shop for" picker. */
  collections: CollectionOption[];
}) {
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(values) !== saved;

  async function save() {
    setSaving(true);
    const result = await saveHeaderMenuAction(values);
    setSaving(false);
    if (result.ok) {
      setSaved(JSON.stringify(values));
      toast.success("Header menu saved — the shop shows it now.");
    } else toast.error(result.error);
  }

  return (
    <div className="space-y-2 rounded-lg border p-5">
      <p className="text-sm text-muted-foreground">
        Each link searches product names, descriptions and tags for its search word. The dependable
        way to put a piece under a link is to give it that word as a tag — in Products, tick pieces
        and use Organise → Add a tag. A link nothing matches shows an empty page, so only list what
        you stock.
      </p>

      <NavListEditor
        id="navShopFor"
        title="Jewellery → Shop for"
        description={
          collections.length > 0
            ? "Men, Women, Kids, Devotional… Each link opens a collection — create one in Collections with a product tag (say “men”), then tag the pieces. A collection you unpublish drops out of the menu by itself."
            : "Men, Women, Kids, Devotional… Each link opens a collection, and none are published yet. Create one in Collections with a product tag (say “men”), tag the pieces, then come back here."
        }
        placeholder="e.g. Men"
        rows={values.navShopFor}
        onChange={(navShopFor) => setValues((v) => ({ ...v, navShopFor }))}
        disabled={saving}
        collections={collections}
      />
      <NavListEditor
        id="navFinishes"
        title="Jewellery → By finish"
        description="Shown in the Jewellery menu."
        placeholder="e.g. Oxidised"
        rows={values.navFinishes}
        onChange={(navFinishes) => setValues((v) => ({ ...v, navFinishes }))}
        disabled={saving}
      />
      <NavListEditor
        id="navOccasions"
        title="Gifting → By occasion"
        description="Shown in the Gifting menu."
        placeholder="e.g. Bridal"
        rows={values.navOccasions}
        onChange={(navOccasions) => setValues((v) => ({ ...v, navOccasions }))}
        disabled={saving}
      />

      <div className="flex items-center gap-3 pt-3">
        <Button onClick={save} disabled={saving || !dirty}>
          {saving ? "Saving…" : "Save header menu"}
        </Button>
        {dirty && !saving && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
      </div>
    </div>
  );
}
