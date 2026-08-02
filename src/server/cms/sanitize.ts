import sanitizeHtml from "sanitize-html";
import type { FieldDefinition, EntryData } from "@/server/cms/types";

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "strong", "em", "u", "s", "code", "pre", "blockquote",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li", "a", "img", "hr", "mark", "sub", "sup",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    img: ["src", "alt", "width", "height"],
    "*": ["class"],
  },
  allowedSchemes: ["https", "http", "mailto"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      target: "_blank",
      rel: "noopener noreferrer",
    }),
  },
};

export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

/**
 * Write-time sanitization of an entry's data against its content type's
 * field definitions — richtext values are cleaned wherever they appear,
 * recursing into array/object sub-fields. Defense in depth: the storefront
 * render path sanitizes again at read time (see components/storefront/cms).
 */
export function sanitizeEntryData(fields: FieldDefinition[], data: EntryData): EntryData {
  const out: EntryData = { ...data };
  for (const field of fields) {
    const value = out[field.name];
    if (value === undefined || value === null) continue;

    if (field.type === "richtext" && typeof value === "string") {
      out[field.name] = sanitizeRichText(value);
    } else if (field.type === "array" && Array.isArray(value) && field.of) {
      out[field.name] = value.map((item) =>
        typeof item === "object" && item !== null
          ? sanitizeEntryData(field.of!, item as EntryData)
          : item
      );
    } else if (field.type === "object" && typeof value === "object" && field.of) {
      out[field.name] = sanitizeEntryData(field.of, value as EntryData);
    }
  }
  return out;
}
