import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * The storefront's editorial call to action: a word, a hairline underline, and
 * an arrow that steps forward on hover.
 *
 * This is the shape the whole site should reach for by default. Square block
 * buttons (`variant="cta"`) are reserved for the four moments where something
 * is actually being bought — add to cart, buy now, checkout, place order.
 * Everything else — discover, explore, view all, read more — is this.
 *
 * A server component with no client JavaScript: the arrow's translate is a CSS
 * transition on the link's own hover, so it costs nothing.
 *
 * `light` is for placement over a dark photograph, where the ink underline
 * disappears and --black goes muddy. It is a modifier rather than a
 * caller-supplied className because getting this wrong is invisible until
 * someone looks at the hero on a bright monitor.
 */
export function EditorialLink({
  href,
  children,
  light = false,
  className = "",
  transitionTypes,
}: {
  href: string;
  children: React.ReactNode;
  /** Over dark imagery — white rule and label instead of ink. */
  light?: boolean;
  className?: string;
  /** Passed through to next/link for directional view transitions. */
  transitionTypes?: string[];
}) {
  return (
    <Link
      href={href}
      transitionTypes={transitionTypes}
      className={`group/edlink inline-flex items-center gap-2 border-b pb-1 text-sm font-medium transition-colors ${
        light
          ? "border-white/70 text-white hover:border-white"
          : "border-foreground text-foreground hover:border-black hover:text-black"
      } ${className}`}
    >
      {children}
      <ArrowRight
        aria-hidden
        className="size-4 transition-transform duration-300 group-hover/edlink:translate-x-1"
      />
    </Link>
  );
}
