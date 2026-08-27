"use client";

import { useState } from "react";
import Image from "next/image";
import { Plus, Trash2, ChevronUp, ChevronDown, ChevronRight, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichTextEditor } from "@/components/cms/rich-text-editor";
import { MediaPicker } from "@/components/cms/media-picker";
import type { FieldDefinition } from "@/server/cms/types";

type Value = unknown;
type OnChange = (value: Value) => void;

/** Cloudinary serves video from /video/upload/; also match bare extensions. */
function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url) || url.includes("/video/upload/");
}

/**
 * Image or image-plus-video field.
 *
 * `accept="media"` widens the picker to video for the one renderer that handles
 * it (the hero slide). The preview branches on the URL because next/image
 * throws on a video source — which is why this couldn't simply be the existing
 * ImageField with a looser filter.
 */
function ImageField({
  value,
  onChange,
  accept = "image",
}: {
  value: Value;
  onChange: OnChange;
  accept?: "image" | "media";
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const url = typeof value === "string" ? value : "";
  const isVideo = url !== "" && isVideoUrl(url);
  const noun = accept === "media" ? "media" : "image";

  return (
    <div className="flex items-center gap-3">
      {url ? (
        <div className="relative h-20 w-20 overflow-hidden rounded-md border">
          {isVideo ? (
            <video
              src={url}
              muted
              playsInline
              preload="metadata"
              className="h-full w-full bg-black object-cover"
            />
          ) : (
            <Image src={url} alt="" fill className="object-cover" sizes="80px" />
          )}
        </div>
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed">
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
          {url ? `Change ${noun}` : `Choose ${noun}`}
        </Button>
        {url && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
            Remove
          </Button>
        )}
      </div>
      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(asset) => onChange(asset.url)}
        accept={accept}
      />
    </div>
  );
}

/**
 * Splits a field label into its name and its explanation.
 *
 * Labels in this CMS carry their own help text after an em dash — "Hero slides
 * — order here is the order they rotate in". Rendered whole, in the Label's
 * weight, that is a sentence of bold type over every input and a large part of
 * why these forms read as walls of text. The head becomes the label; the tail
 * becomes one line of muted help beneath it.
 */
function splitLabel(label: string): { title: string; hint?: string } {
  // [\s\S] rather than `.` with the `s` flag — the tsconfig target predates it.
  const match = label.match(/^([\s\S]*?)\s+[—–-]\s+([\s\S]*)$/);
  if (!match) return { title: label };
  return { title: match[1].trim(), hint: match[2].trim() };
}

/**
 * A short singular noun for an array's counts and its Add button.
 *
 * Derived from the label's NAME half only, so "Homepage sections — order here
 * is the order on the page" gives "homepage section" rather than repeating the
 * whole sentence on the button and again in the count.
 */
function shortNoun(label: string): string {
  const base = splitLabel(label).title.toLowerCase().trim();
  // Only the regular plural, and only at the end. Nothing here is irregular,
  // and a general inflector would be a lot of machinery for six labels.
  return base.endsWith("ies")
    ? `${base.slice(0, -3)}y`
    : base.endsWith("s") && !base.endsWith("ss")
      ? base.slice(0, -1)
      : base;
}

/** Rich text arrives as HTML; a collapsed row wants the words, not the markup. */
function toPlainText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The one-line title for a collapsed row.
 *
 * Prefers the schema's `summaryField`, then the first text-ish sub-field —
 * which for every array in this CMS is the item's name or heading. An item with
 * nothing typed yet has no title to show, so it says so rather than rendering
 * an empty row that looks broken.
 */
function itemSummary(
  field: FieldDefinition,
  item: Record<string, unknown>,
  subFields: FieldDefinition[],
  /** The object above this array, for parent-scoped showWhen rules. */
  parent?: Record<string, unknown>
): { title: string; empty: boolean } {
  /**
   * Only fields the editor can actually SEE for this item.
   *
   * ⚠️  Without the filter a row is summarised by a field its own form does not
   * offer. Homepage sections hide heading, eyebrow and subtitle for the two
   * kinds that ignore them, so a `categoryTiles` row would be labelled from a
   * heading nobody can edit — and a new one, having none, would read "Empty —
   * nothing typed yet" while being perfectly complete.
   */
  const visible = subFields.filter((sub) => isFieldVisible(sub, item, parent));

  const named = field.summaryField
    ? visible.find((sub) => sub.name === field.summaryField)
    : undefined;
  const fallback = visible.find(
    (sub) => sub.type === "text" || sub.type === "textarea" || sub.type === "richtext"
  );
  const source = named ?? fallback;

  // No text field on this item at all — the badge beside the row already names
  // what it is, so there is nothing missing and nothing to complain about.
  if (!source) return { title: "", empty: false };

  const text = toPlainText(item[source.name]);
  if (!text) return { title: "Empty — nothing typed yet", empty: true };
  // Long enough to identify the row, short enough to stay on one line.
  return { title: text.length > 90 ? `${text.slice(0, 90)}…` : text, empty: false };
}

/**
 * A repeating list of items.
 *
 * ── Rows collapse, and that is the whole design ──────────────────────────────
 * Every item used to render its full form, always. For the FAQ that meant
 * twelve questions each carrying a rich-text editor and its toolbar: 5,783px of
 * scrolling — 5.4 screens — and twelve TipTap instances mounted at once, to
 * find one question. Collapsed rows turn that into a list you can see at once,
 * and only opened items pay for an editor.
 *
 * Independent toggles rather than an accordion: comparing two answers, or
 * pasting from one row into another, both need two rows open. Nothing forces
 * the previous one shut.
 *
 * ⚠️  Open state is keyed by INDEX, so it must be remapped whenever the indices
 * move — see move() and remove(). Without that, deleting row 2 leaves row 3's
 * form open under row 2's title, which reads as the wrong data being edited.
 */
function ArrayField({
  field,
  value,
  onChange,
  parent,
}: {
  field: FieldDefinition;
  value: Value;
  onChange: OnChange;
  /**
   * The object containing this array — a homepage SECTION, for the `items[]`
   * nested inside one. Undefined for a top-level array, which has nothing
   * above it. Its rows' fields can test it with `showWhen.scope: "parent"`.
   */
  parent?: Record<string, unknown>;
}) {
  const items: Array<Record<string, unknown>> = Array.isArray(value)
    ? (value as Array<Record<string, unknown>>)
    : [];
  const subFields = field.of ?? [];
  const singular = shortNoun(field.label);
  const plural = singular.endsWith("s") ? singular : `${singular}s`;

  const [open, setOpen] = useState<Set<number>>(() => new Set());

  function toggle(index: number) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function updateItem(index: number, itemValue: Record<string, unknown>) {
    const next = [...items];
    next[index] = itemValue;
    onChange(next);
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(index + dir, 0, item);
    onChange(next);

    // The two rows swap places, so their open flags swap with them.
    const target = index + dir;
    setOpen((prev) => {
      const set = new Set(prev);
      const had = prev.has(index);
      const other = prev.has(target);
      if (other) set.add(index);
      else set.delete(index);
      if (had) set.add(target);
      else set.delete(target);
      return set;
    });
  }

  function remove(index: number) {
    onChange(items.filter((_, j) => j !== index));
    // Everything after the removed row shifts down one.
    setOpen((prev) => {
      const set = new Set<number>();
      for (const i of prev) {
        if (i < index) set.add(i);
        else if (i > index) set.add(i - 1);
      }
      return set;
    });
  }

  function add() {
    onChange([...items, {}]);
    // A new row is empty, so there is nothing to read in its collapsed title —
    // it opens straight away, ready to type into.
    setOpen((prev) => new Set(prev).add(items.length));
  }

  const addButton = (
    <Button type="button" variant="outline" size="sm" onClick={add}>
      <Plus className="h-4 w-4" /> Add {singular}
    </Button>
  );

  return (
    <div className="space-y-2">
      {/* Count and controls above the list: with rows collapsed the list can be
          long, and "add" belonged only at the bottom — a scroll to the end for
          every new item. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {items.length} {items.length === 1 ? singular : plural}
        </span>
        <div className="flex items-center gap-1">
          {open.size > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setOpen(new Set())}
            >
              Collapse all
            </Button>
          )}
          {addButton}
        </div>
      </div>

      <div className="divide-y rounded-md border">
        {items.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Nothing here yet.
          </p>
        )}

        {items.map((item, i) => {
          const isOpen = open.has(i);
          const { title, empty } = itemSummary(field, item, subFields, parent);
          const badge = field.summaryBadgeField
            ? toPlainText(item[field.summaryBadgeField])
            : "";

          return (
            <div key={i}>
              <div className="flex items-center gap-2 px-2 py-1.5">
                {/* The whole title is the toggle, not a small chevron — a 44px
                    row with a 14px hit target is a row you miss. */}
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  aria-expanded={isOpen}
                  // Stable hook for tests: `button[aria-expanded]` alone also
                  // matches the mobile nav trigger and every other disclosure
                  // on the page.
                  data-array-row={i}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left hover:bg-muted/60"
                >
                  <ChevronRight
                    className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                      isOpen ? "rotate-90" : ""
                    }`}
                    aria-hidden
                  />
                  <span className="w-6 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <span
                    className={`truncate text-sm ${
                      empty ? "italic text-muted-foreground" : "font-medium"
                    }`}
                  >
                    {title}
                  </span>
                  {badge && (
                    <span className="ml-auto hidden shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground sm:inline">
                      {badge}
                    </span>
                  )}
                </button>

                <div className="flex shrink-0 gap-0.5">
                  <Button
                    type="button" variant="ghost" size="icon" className="h-7 w-7"
                    disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${singular} ${i + 1} up`}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button" variant="ghost" size="icon" className="h-7 w-7"
                    disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${singular} ${i + 1} down`}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button" variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => remove(i)} aria-label={`Remove ${singular} ${i + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Unmounted when closed, not hidden — a mounted TipTap instance
                  costs the same whether or not anyone can see it, and mounting
                  twelve is what made this screen slow. */}
              {isOpen && (
                <div className="space-y-3 border-t bg-muted/20 px-3 py-3">
                  {subFields
                    .filter((sub) => isFieldVisible(sub, item, parent))
                    .map((sub) => (
                      <FieldInput
                        key={sub.name}
                        field={sub}
                        value={item[sub.name]}
                        onChange={(v) => updateItem(i, { ...item, [sub.name]: v })}
                        // This row becomes the parent of anything nested inside
                        // it — which is what lets an `items[]` field be scoped
                        // by the section type sitting on `item`.
                        parent={item}
                      />
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Also at the bottom: after editing the last item, that is where the
          cursor already is. */}
      {items.length > 0 && addButton}
    </div>
  );
}

/**
 * The generic renderer behind the whole CMS: one widget per field type, with
 * array/object types recursing into their `of` sub-fields — no per-content-
 * type hardcoded forms anywhere.
 */
export function FieldInput({
  field,
  value,
  onChange,
  parent,
}: {
  field: FieldDefinition;
  value: Value;
  onChange: OnChange;
  /** Passed straight through to ArrayField — see its note. */
  parent?: Record<string, unknown>;
}) {
  if (field.hidden) return null;

  const str = typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);

  const control = (() => {
    switch (field.type) {
      case "textarea":
        return (
          <Textarea
            value={str}
            placeholder={field.placeholder}
            readOnly={field.readOnly}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
          />
        );
      case "richtext":
        return (
          <RichTextEditor
            value={str}
            onChange={onChange}
            placeholder={field.placeholder}
            maxLength={field.validation?.max}
          />
        );
      case "number":
        return (
          <Input
            type="number"
            value={str}
            placeholder={field.placeholder}
            readOnly={field.readOnly}
            min={field.validation?.min}
            max={field.validation?.max}
            onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          />
        );
      case "boolean":
        return (
          <Switch checked={value === true} onCheckedChange={(checked) => onChange(checked)} />
        );
      case "select":
        return (
          <Select value={str} onValueChange={onChange}>
            <SelectTrigger>
              <SelectValue placeholder={field.placeholder ?? "Choose…"} />
            </SelectTrigger>
            <SelectContent>
              {(field.options ?? []).map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "image":
        return <ImageField value={value} onChange={onChange} />;
      case "media":
        return <ImageField value={value} onChange={onChange} accept="media" />;
      case "date":
        return (
          <Input
            type="date"
            value={str.slice(0, 10)}
            readOnly={field.readOnly}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      case "color":
        return (
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(str) ? str : "#000000"}
              onChange={(e) => onChange(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded-md border"
            />
            <Input value={str} placeholder="#000000" onChange={(e) => onChange(e.target.value)} className="w-28" />
          </div>
        );
      case "array":
        return <ArrayField field={field} value={value} onChange={onChange} parent={parent} />;
      case "object":
        return (
          <div className="space-y-3 rounded-md border p-3">
            {(field.of ?? []).map((sub) => (
              <FieldInput
                key={sub.name}
                field={sub}
                value={((value as Record<string, unknown>) ?? {})[sub.name]}
                onChange={(v) =>
                  onChange({ ...((value as Record<string, unknown>) ?? {}), [sub.name]: v })
                }
              />
            ))}
          </div>
        );
      case "slug":
      case "text":
      default:
        return (
          <Input
            value={str}
            placeholder={field.placeholder}
            readOnly={field.readOnly}
            onChange={(e) => onChange(e.target.value)}
          />
        );
    }
  })();

  const { title, hint } = splitLabel(field.label);

  return (
    <div className="space-y-1.5">
      <div className="space-y-0.5">
        <Label className="flex items-center gap-1">
          {title}
          {field.required && <span className="text-destructive">*</span>}
        </Label>
        {/* The explanation half of the label, set as help text rather than as
            more bold type — see splitLabel. */}
        {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
      {control}
    </div>
  );
}

/**
 * Whether a field applies to the item currently being edited.
 *
 * Only meaningful inside arrays/objects, where sibling values are available —
 * a top-level field has no siblings and is always shown.
 */
export function isFieldVisible(
  field: FieldDefinition,
  siblings: Record<string, unknown>,
  /** The object one level up, when there is one. See the note on `scope`. */
  parent?: Record<string, unknown>
): boolean {
  if (!field.showWhen) return true;

  /**
   * "parent" is how a repeater's rows are scoped by the thing containing them.
   *
   * An `items[]` row's siblings are icon/title/text/image/href — the section
   * `type` that decides which of those the storefront actually reads lives one
   * level up. Without this a rule written against `type` would read undefined
   * and hide the field always, which looks identical to the field simply not
   * existing.
   *
   * A parent-scoped rule at the top level has no object above it, so it hides
   * the field. That is deliberate: silently showing a field whose condition
   * could not be evaluated is how a dead end gets back in.
   */
  const source = field.showWhen.scope === "parent" ? parent : siblings;
  const actual = source?.[field.showWhen.field];
  if (typeof actual !== "string") return false;
  return field.showWhen.equals
    ? field.showWhen.equals.includes(actual)
    : !field.showWhen.notEquals.includes(actual);
}
