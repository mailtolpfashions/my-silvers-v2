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
   */
  showWhen?: { field: string; equals: string[] };
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
