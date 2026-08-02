import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import type { ProductListItem } from "@/server/products/search";

export function ProductCard({ product }: { product: ProductListItem }) {
  const image = product.images[0];

  return (
    <Link href={`/products/${product.slug}`} className="group block">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
        {image ? (
          <Image
            src={image}
            alt={product.name}
            fill
            className="object-cover transition-transform group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, 25vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}
        {product.isBestseller && (
          <Badge className="absolute left-2 top-2" variant="secondary">
            Bestseller
          </Badge>
        )}
      </div>
      <div className="mt-3 space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {product.categoryName}
        </p>
        <p className="text-sm font-medium">{product.name}</p>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">₹{product.price}</span>
          {product.compareAtPrice && (
            <span className="text-xs text-muted-foreground line-through">
              ₹{product.compareAtPrice}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
