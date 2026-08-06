import { Skeleton } from "@/components/ui/skeleton";
import {
  CARD_IMAGE_CLASS,
  CARD_TITLE_CLASS,
  CARD_SHELL_CLASS,
  PRODUCT_GRID_CLASS,
} from "@/lib/card-styles";

/**
 * Placeholder for one ProductCard.
 *
 * The image box and title block import their geometry from product-card.tsx
 * rather than restating it — if the two drift, every streamed grid reflows as
 * it resolves. Restyle the card and this follows automatically.
 */
export function ProductCardSkeleton() {
  return (
    // Mirrors the card's frame and flex column so the CTA placeholder sits on
    // the same baseline the real button will occupy.
    <div className={`flex h-full flex-col ${CARD_SHELL_CLASS}`}>
      <div className={CARD_IMAGE_CLASS}>
        <Skeleton className="size-full" />
      </div>
      <div className="flex flex-1 flex-col space-y-2 px-4 pb-4 pt-3.5">
        <div className={CARD_TITLE_CLASS}>
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="mt-1.5 h-3.5 w-2/3" />
        </div>
        <Skeleton className="h-4 w-20" />
        {/* Only the mobile CTA has a placeholder: from lg up the real one is
            hidden until hover, so reserving space for it here would leave a
            gap the card never fills. */}
        <div className="mt-auto pt-1 lg:hidden">
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}

/** A full grid of placeholders, matching the real grid's columns and gaps. */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className={`mt-8 ${PRODUCT_GRID_CLASS}`}>
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}
