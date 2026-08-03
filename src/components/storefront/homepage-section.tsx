import Link from "next/link";
import Image from "next/image";
import { ProductCard } from "@/components/storefront/product-card";
import { CollectionCard } from "@/components/storefront/collection-card";
import { InstagramFeed } from "@/components/storefront/instagram-feed";
import type { HomepageSection as Section } from "@/server/products/homepage-sections";

/**
 * Renders one CMS-configured homepage section. All copy, counts and link
 * targets come from the section data — nothing is decided here.
 */
export function HomepageSection({
  section,
  isAuthed = false,
  wishlistIds,
  cartQuantities,
}: {
  section: Section;
  isAuthed?: boolean;
  wishlistIds?: Set<string>;
  cartQuantities?: Map<string, number>;
}) {
  if (section.kind === "instagram") {
    return <InstagramFeed title={section.title} eyebrow={section.eyebrow} />;
  }

  if (section.kind === "banner") {
    const banner = (
      <div className="relative aspect-[16/5] w-full overflow-hidden rounded-lg bg-muted">
        <Image
          src={section.image}
          alt={section.title}
          fill
          className="object-cover"
          sizes="(max-width: 1600px) 100vw, 1600px"
        />
        {section.title && (
          <>
            <div className="absolute inset-0 bg-gradient-to-r from-black/55 to-transparent" />
            <div className="absolute inset-y-0 left-0 flex max-w-md flex-col justify-center p-6 sm:p-10">
              {section.eyebrow && (
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-light">
                  {section.eyebrow}
                </p>
              )}
              <p className="font-heading text-2xl text-white sm:text-3xl">{section.title}</p>
            </div>
          </>
        )}
      </div>
    );

    return (
      <section className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
        {section.link ? (
          <Link href={section.link} className="block">
            {banner}
          </Link>
        ) : (
          banner
        )}
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[1600px] px-4 py-14 sm:px-6 lg:px-8">
      {(section.title || section.eyebrow || section.viewAllHref) && (
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            {section.eyebrow && <p className="label-eyebrow mb-2">{section.eyebrow}</p>}
            {section.title && (
              <h2 className="text-2xl font-semibold tracking-tight">{section.title}</h2>
            )}
          </div>
          {section.viewAllHref && (
            <Link
              href={section.viewAllHref}
              className="text-sm font-medium text-gold-text underline underline-offset-4"
            >
              View all
            </Link>
          )}
        </div>
      )}

      {section.kind === "products" ? (
        <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
          {section.items.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              isAuthed={isAuthed}
              inWishlist={wishlistIds?.has(product.id) ?? false}
              cartQuantity={cartQuantities?.get(product.id) ?? 0}
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {section.items.map((collection) => (
            <CollectionCard key={collection.id} collection={collection} />
          ))}
        </div>
      )}
    </section>
  );
}
