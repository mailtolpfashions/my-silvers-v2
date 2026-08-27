export type FieldType =
  | "text"
  | "textarea"
  | "richtext"
  | "number"
  | "boolean"
  | "select"
  | "image"
  /**
   * Image OR video. Deliberately separate from "image": most image fields feed
   * next/image, which cannot render a video URL, so a single permissive type
   * would let an editor break the product grid or a blog cover. Use this only
   * where the renderer actually handles both — currently the hero slide.
   */
  | "media"
  | "slug"
  | "date"
  | "color"
  | "array"
  | "object";

/** Whose value a `showWhen` rule reads — a sibling, or the object above. */
export type FieldScope = "self" | "parent";

export type FieldDefinition = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  hidden?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  options?: string[];
  validation?: { min?: number; max?: number; pattern?: string; message?: string };
  /** Sub-fields for array/object types — enables recursive nesting. */
  of?: FieldDefinition[];
  /**
   * Array types only: which sub-field to show as a row's title when collapsed.
   *
   * Array rows collapse by default, so the editor is a scannable list rather
   * than every item's full form stacked — see ArrayField. That list is only
   * usable if each row says what it holds, and only the schema knows which
   * sub-field is the item's name.
   *
   * Falls back to the first text/textarea sub-field, so an array that does not
   * set this still gets a meaningful title rather than "Item #4".
   */
  summaryField?: string;
  /**
   * Array types only: a second sub-field shown as a small badge on the
   * collapsed row. For a grouped list, the group — it is what tells you the
   * row is filed in the wrong place without opening it.
   */
  summaryBadgeField?: string;
  /**
   * Show this field only when a sibling field holds one of these values.
   *
   * Homepage sections share one field list across seven section types, so a
   * `collections` section was rendering the products, banner, editorial and USP
   * fields too — around twenty inputs where four applied. This narrows the form
   * to the section actually being edited.
   *
   * Purely presentational: values already saved are left untouched when a field
   * hides, so flipping a section's type and back does not lose anything.
   *
   * `equals` names the types a field APPLIES to; `notEquals` names the ones it
   * does not. Both test one sibling field, and exactly one of the two is given.
   *
   * The negative form exists for fields that nearly every type uses. Heading,
   * eyebrow and subtitle are ignored by two of the twelve section kinds, and
   * writing that as a ten-item `equals` list would mean every new section type
   * silently loses its heading until somebody remembered to add it here.
   * Stating the exceptions keeps the default correct.
   *
   * `scope` says WHOSE field to test. "self" (the default) reads a sibling —
   * the right thing for a section's own fields, where `type` sits beside them.
   * "parent" reads one level up, which is the only way to scope the fields
   * INSIDE a repeater: an `items[]` row's siblings are icon/title/text/image/
   * href, and the section `type` that decides which of those matter is on the
   * object above it.
   */
  showWhen?:
    | { field: string; scope?: FieldScope; equals: string[]; notEquals?: never }
    | { field: string; scope?: FieldScope; notEquals: string[]; equals?: never };
};

export type EntryData = Record<string, unknown>;

export type SeoInput = {
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: string;
  canonicalUrl?: string;
  noIndex?: boolean;
};

export function parseFields(raw: unknown): FieldDefinition[] {
  return Array.isArray(raw) ? (raw as FieldDefinition[]) : [];
}
