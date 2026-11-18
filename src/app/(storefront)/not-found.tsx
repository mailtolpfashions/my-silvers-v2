import type { Metadata } from "next";
import { NotFoundContent } from "@/components/storefront/not-found-content";

export const metadata: Metadata = { title: "Page not found" };

/**
 * Any notFound() inside the storefront — and, through [...missing], any
 * address that matches no page — renders here, inside the shop's header and
 * footer. See components/storefront/not-found-content.tsx.
 */
export default function StorefrontNotFound() {
  return <NotFoundContent />;
}
