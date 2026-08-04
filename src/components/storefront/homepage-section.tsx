import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { CmsIcon } from "@/components/storefront/cms/cms-icon";
import { ProductCard, productMorphName, PRODUCT_GRID_CLASS } from "@/components/storefront/product-card";
import { CollectionCard } from "@/components/storefront/collection-card";
import type { HomepageSection as Section } from "@/server/products/homepage-sections";

/**
 * Renders one CMS-configured homepage section. All copy, counts and link
 * targets come from the section data — nothing is decided here.
 */
export function HomepageSection({
  section,
  morphOwner,
  instagramSlot,
}: {
  section: Section;
  /**
   * productId → the section key allowed to own that product's morph name.
   * Built once per page so a product shown twice cannot register a duplicate
   * view-transition-name. See the note in (storefront)/page.tsx.
   */
  morphOwner?: Map<string, string>;
  /**
   * The Instagram feed, supplied by the caller rather than imported here.
   *
   * InstagramFeed is an async server component that calls the Graph API, so a
   * static import would drag server-only code into any client tree that renders
   * a section — which is exactly what the CMS preview needs to do. The
   * storefront passes the real feed; the preview passes a placeholder.
   */
  instagramSlot?: React.ReactNode;
}) {
  if (section.kind === "instagram") {
    return instagramSlot ?? null;
  }

  if (section.kind === "editorial") {
    const imageFirst = section.imageSide === "left";
    return (
      <section className="container-page py-16 sm:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          {section.image && (
            <div
              // order controls which side the image lands on without changing
              // the DOM order, so the heading still precedes its copy for
              // screen readers and keyboard users.
              className={`relative aspect-[4/3] overflow-hidden rounded-md bg-muted ${
                imageFirst ? "lg:order-1" : "lg:order-2"
              }`}
            >
              <Image
                src={section.image}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </div>
          )}
          <div className={imageFirst ? "lg:order-2" : "lg:order-1"}>
            {section.eyebrow && <p className="label-eyebrow mb-3">{section.eyebrow}</p>}
            <h2 className="text-h2 rule-brass">{section.title}</h2>
            {section.body && (
              <p className="mt-6 max-w-prose leading-relaxed text-muted-foreground">
                {section.body}
              </p>
            )}
            {section.ctaLabel && section.ctaHref && (
              <Button asChild size="lg" className="mt-8">
                <Link href={section.ctaHref}>{section.ctaLabel}</Link>
              </Button>
            )}
          </div>
        </div>
      </section>
    );
  }

  if (section.kind === "categoryTiles") {
    return (
      <section className="container-page py-14">
        <SectionHeading title={section.title} eyebrow={section.eyebrow} />
        <ul className="flex flex-wrap justify-center gap-x-8 gap-y-8 sm:gap-x-12">
          {section.items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/category/${item.slug}`}
                className="group flex w-24 flex-col items-center gap-3 sm:w-28"
              >
                <div className="relative size-24 overflow-hidden rounded-full bg-muted ring-1 ring-border transition-all duration-300 group-hover:ring-2 group-hover:ring-brass sm:size-28">
                  {item.image && (
                    <Image
                      src={item.image}
                      alt=""
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      sizes="112px"
                    />
                  )}
                </div>
                <span className="text-center text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                  {item.name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (section.kind === "usp") {
    return (
      <section className="border-y bg-muted/40">
        <div className="container-page py-14">
          <SectionHeading title={section.title} eyebrow={section.eyebrow} />
          <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {section.items.map((item, i) => (
              <li key={i} className="flex flex-col items-center text-center">
                {/* Same resolver as the trust bar: a Lucide name or an emoji. */}
                <CmsIcon name={item.icon} className="mb-3 size-6 text-brass-text" />
                {item.title && (
                  <p className="font-heading text-base text-foreground">{item.title}</p>
                )}
                {item.text && (
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {item.text}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
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
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-brass-light">
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
      <section className="container-page py-8">
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
    <section className="container-page py-14">
      {(section.title || section.eyebrow || section.viewAllHref) && (
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            {section.eyebrow && <p className="label-eyebrow mb-2">{section.eyebrow}</p>}
            {section.title && (
              <h2 className="text-h2">{section.title}</h2>
            )}
          </div>
          {section.viewAllHref && (
            <Link
              href={section.viewAllHref}
              className="text-sm font-medium text-brass-text underline underline-offset-4"
            >
              View all
            </Link>
          )}
        </div>
      )}

      {section.kind === "products" ? (
        <div className={PRODUCT_GRID_CLASS}>
          {section.items.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              morphName={
                morphOwner?.get(product.id) === section.key
                  ? productMorphName(product.id)
                  : undefined
              }
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

/** Shared heading block for the sections that have one. */
function SectionHeading({ title, eyebrow }: { title?: string; eyebrow?: string }) {
  if (!title && !eyebrow) return null;
  return (
    <div className="mb-10 text-center">
      {eyebrow && <p className="label-eyebrow mb-2">{eyebrow}</p>}
      {title && <h2 className="text-h2">{title}</h2>}
    </div>
  );
}
