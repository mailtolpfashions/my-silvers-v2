import { notFound } from "next/navigation";

/**
 * Catches every address that matches no page, so its 404 renders inside the
 * storefront layout (header, footer, search) via (storefront)/not-found.tsx
 * rather than as a bare page from the root. Every real route is more specific
 * than this one and wins.
 */
export default function MissingPage() {
  notFound();
}
