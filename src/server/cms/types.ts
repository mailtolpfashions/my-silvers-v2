export type FieldType =
  | "text"
  | "textarea"
  | "richtext"
  | "number"
  | "boolean"
  | "select"
  | "image"
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
