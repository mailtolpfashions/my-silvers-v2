import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import type { ProductListItem } from "@/server/products/search";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function ProductCard({ product }: { product: ProductListItem }) {
  const image = product.images[0];
  const price = Number(product.price);
  const compareAt = product.compareAtPrice ? Number(product.compareAtPrice) : null;
  const discount =
    compareAt && compareAt > price ? Math.round(((compareAt - price) / compareAt) * 100) : null;

  return (
    <Link href={`/products/${product.slug}`} className="group block">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
        {image ? (
          <Image
            src={image}
            alt={product.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 400px"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No image
          </div>
        )}

        {product.isBestseller && (
          <Badge className="absolute left-3 top-3" variant="secondary">
            Bestseller
          </Badge>
        )}
        {discount !== null && discount > 0 && (
          <Badge className="absolute right-3 top-3 bg-gold text-ink hover:bg-gold">
            {discount}% off
          </Badge>
        )}
      </div>

      <div className="mt-4 space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-text">
          {product.categoryName}
        </p>
        {/* Two-line clamp with a reserved height keeps every row's prices aligned
            regardless of title length. */}
        <h3 className="line-clamp-2 min-h-[2.75rem] text-base leading-snug text-foreground">
          {product.name}
        </h3>
        <div className="flex flex-wrap items-baseline gap-2 pt-0.5">
          <span className="text-lg font-semibold text-foreground">{inr.format(price)}</span>
          {compareAt && compareAt > price && (
            <span className="text-sm text-muted-foreground line-through">
              {inr.format(compareAt)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
