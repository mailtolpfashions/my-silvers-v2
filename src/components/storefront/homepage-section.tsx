import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { CmsIcon } from "@/components/storefront/cms/cms-icon";
import { ProductCard, productMorphName, PRODUCT_GRID_CLASS } from "@/components/storefront/product-card";
import { CollectionCard } from "@/components/storefront/collection-card";
import { RevealSection } from "@/components/storefront/reveal-section";
import { StorySection } from "@/components/storefront/story-section";
import { EditorialPair } from "@/components/storefront/editorial-pair";
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

  if (section.kind === "editorialPair") {
    return (
      <EditorialPair
        title={section.title}
        eyebrow={section.eyebrow}
        subtitle={section.subtitle}
        items={section.items}
      />
    );
  }

  if (section.kind === "story") {
    return (
      <StorySection
        title={section.title}
        eyebrow={section.eyebrow}
        stages={section.stages}
        image={section.image!}
        ctaLabel={section.ctaLabel}
        ctaHref={section.ctaHref}
      />
    );
  }

  if (section.kind === "editorial") {
    const imageFirst = section.imageSide === "left";
    return (
      <RevealSection className="container-page py-20 sm:py-28 lg:py-40">
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
            {section.subtitle && (
              <p className="text-lead mt-4 max-w-prose text-muted-foreground">{section.subtitle}</p>
            )}
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
      </RevealSection>
    );
  }

  if (section.kind === "categoryTiles") {
    // Tall full-bleed panels running edge to edge with no gap between them and
    // the category name laid over the photograph — not the row of small circles
    // this used to be. The circles were a chip: they turned the photography into
    // a thumbnail and pushed the name outside the picture. These are closer to
    // three doorways, and the whole band is one continuous image.
    //
    // Deliberately outside container-page so it reaches the viewport edges, and
    // deliberately without a heading — the panels name themselves.
    return (
      <RevealSection className="grid grid-cols-1 sm:grid-cols-3">
        {section.items.slice(0, 3).map((item) => (
          <Link
            key={item.id}
            href={`/category/${item.slug}`}
            // 4:5 stacked on a phone so three panels do not become three
            // screens of scrolling; tall and near-viewport-height side by side.
            className="group relative flex aspect-[4/5] items-end justify-center overflow-hidden bg-muted sm:aspect-auto sm:h-[70vh] lg:h-[85vh]"
          >
            {item.image && (
              <Image
                src={item.image}
                alt=""
                fill
                className="object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.03]"
                sizes="(max-width: 640px) 100vw, 33vw"
              />
            )}

            {/* Just enough darkening at the foot to carry white type over an
                arbitrary photograph, and nothing at the top. */}
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-t from-graphite-950/60 via-graphite-950/10 to-transparent"
            />

            <div className="relative flex flex-col items-center gap-6 p-8 pb-12 sm:pb-16">
              <span className="text-h3 font-medium text-white">{item.name}</span>
              {/* The block button appears on hover, the way theirs does — at
                  rest the panel is a photograph and a name. On touch there is
                  no hover, so it is always visible below sm. */}
              <span className="inline-flex h-12 items-center bg-graphite-950 px-10 text-[13px] uppercase tracking-[0.08em] text-ivory-100 transition-opacity duration-300 sm:opacity-0 sm:group-hover:opacity-100">
                Discover now
              </span>
            </div>
          </Link>
        ))}
      </RevealSection>
    );
  }

  if (section.kind === "usp") {
    return (
      <RevealSection className="border-y bg-muted/40">
        <div className="container-page py-20 sm:py-28 lg:py-40">
          <SectionHeading
            title={section.title}
            eyebrow={section.eyebrow}
            subtitle={section.subtitle}
          />
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
      </RevealSection>
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
      <RevealSection className="container-page py-4 sm:py-8">
        {section.link ? (
          <Link href={section.link} className="block">
            {banner}
          </Link>
        ) : (
          banner
        )}
      </RevealSection>
    );
  }

  // One reveal mechanism for the whole section, and it is the CSS one. The
  // GSAP stagger that used to animate each card individually is gone — see
  // story-section.tsx for what the measurement showed.
  // Padding roughly doubled from what it was. On the reference site there is
  // something like 200px of empty page between one section and the next, and
  // that emptiness is doing as much work as anything inside the sections. It
  // is the cheapest luxury signal there is and the easiest one to spend.
  return (
    <RevealSection className="container-page py-20 sm:py-28 lg:py-40">
      <SectionHeading
        title={section.title}
        eyebrow={section.eyebrow}
        subtitle={section.subtitle}
      />

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

      {/* Below the grid, not beside the heading — a centred heading has no right
          edge to hang it off, and this is the point where a shopper who scanned
          the row actually wants more. */}
      {section.viewAllHref && (
        <div className="mt-14 flex justify-center">
          <Button asChild variant="cta" size="cta">
            <Link href={section.viewAllHref}>View all</Link>
          </Button>
        </div>
      )}
    </RevealSection>
  );
}

/**
 * Shared heading block. Centred, because that rhythm — eyebrow, heading,
 * one explanatory line — is what makes a long homepage read as chapters rather
 * than a stack of grids. Every section with a heading now uses it, including
 * products and collections, which used to left-align their own inline version.
 */
function SectionHeading({
  title,
  eyebrow,
  subtitle,
}: {
  title?: string;
  eyebrow?: string;
  subtitle?: string;
}) {
  if (!title && !eyebrow && !subtitle) return null;
  return (
    <div className="mb-10 text-center sm:mb-14">
      {eyebrow && <p className="label-eyebrow mb-3">{eyebrow}</p>}
      {title && <h2 className="text-h2">{title}</h2>}
      {subtitle && (
        <p className="text-lead mx-auto mt-3 max-w-prose text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}
