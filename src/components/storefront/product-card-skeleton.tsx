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
    <div className="flex h-full flex-col">
      <div className={`${CARD_SHELL_CLASS} ${CARD_IMAGE_CLASS}`}>
        <Skeleton className="size-full" />
      </div>
      {/* Category line, two lines of name, price. No CTA placeholder — the card
          no longer has one at any width. */}
      <div className="flex flex-1 flex-col px-1 pt-4 sm:px-2">
        <Skeleton className="h-3 w-16" />
        <div className={`${CARD_TITLE_CLASS} mt-1`}>
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="mt-1.5 h-3.5 w-2/3" />
        </div>
        <Skeleton className="mt-1.5 h-3.5 w-20" />
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
