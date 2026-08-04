/**
 * `<ViewTransition>` ships in the React build Next bundles for the App Router,
 * but not in the react@19.2.4 types installed here — so TypeScript needs to be
 * told it exists. Next's docs cover this: "App Router uses React canary
 * releases … You do not need to install react@canary yourself."
 *
 * Verified present: node_modules/next/dist/compiled/react/cjs/react.development.js
 * exports `ViewTransition`.
 *
 * Delete this file once @types/react declares the component.
 */
import "react";

declare module "react" {
  /**
   * Per-trigger animation class names. A bare string applies to every
   * transition type; the object form maps a `transitionTypes` entry (set on
   * `<Link transitionTypes={[...]}>`) to a class, with `default` as fallback.
   */
  type ViewTransitionClass = string | Record<string, string>;

  interface ViewTransitionProps {
    children?: ReactNode;
    /**
     * Shared identity across routes. Two elements with the same `name` on the
     * old and new page morph into one another.
     *
     * Must be unique within a single document — duplicates cause the browser to
     * skip the transition for the whole page, not just that element.
     */
    name?: string;
    /** Applied when the element exists in both the old and new page. */
    share?: ViewTransitionClass;
    /** Applied when the element is only in the new page. */
    enter?: ViewTransitionClass;
    /** Applied when the element is only in the old page. */
    exit?: ViewTransitionClass;
    /** Fallback for transitions this element does not otherwise match. */
    default?: ViewTransitionClass;
    onEnter?: (instance: unknown, types: string[]) => void;
    onExit?: (instance: unknown, types: string[]) => void;
    onShare?: (instance: unknown, types: string[]) => void;
  }

  const ViewTransition: (props: ViewTransitionProps) => ReactNode;
}
