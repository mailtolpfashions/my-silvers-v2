import { sanitizeRichText } from "@/server/cms/sanitize";

/**
 * Server-rendered rich text. Content was already sanitized at write time;
 * sanitizing again here is deliberate defense in depth (the old site rendered
 * raw HTML at read time — a gap this closes).
 */
export function RichText({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={`prose prose-neutral max-w-none dark:prose-invert ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: sanitizeRichText(html) }}
    />
  );
}
