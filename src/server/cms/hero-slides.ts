import type { HeroSlide } from "@/components/storefront/hero-carousel";
import type { EntryData } from "@/server/cms/types";

const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value : undefined;

/**
 * Maps the homepage entry's `slides` array onto the carousel's props.
 *
 * Slides used to be their own content type, which meant two places could define
 * the hero — the `heroSlide` entries and a parallel set of hero* fields on the
 * homepage — with the entries silently winning. They now live on the homepage
 * itself, so there is exactly one source.
 *
 * Array position is the running order; the old `sortOrder` field is gone.
 * Inactive slides and slides with no headline are dropped.
 */
export function toHeroSlides(data: EntryData | undefined): HeroSlide[] {
  const raw = Array.isArray(data?.slides) ? (data.slides as Array<Record<string, unknown>>) : [];

  return raw
    .filter((slide) => slide?.isActive !== false && Boolean(str(slide?.headline)))
    .map((slide, i) => {
      const overlay = Number(slide.overlayOpacity);
      return {
        // Index is a stable key here: the array is the order, and a reorder
        // should re-key so the entrance animation replays.
        id: `slide-${i}`,
        eyebrow: str(slide.eyebrow),
        headline: str(slide.headline)!,
        subline: str(slide.subline),
        ctaLabel: str(slide.ctaLabel),
        ctaHref: str(slide.ctaHref),
        secondaryLabel: str(slide.secondaryLabel),
        secondaryHref: str(slide.secondaryHref),
        media: str(slide.media),
        mediaMobile: str(slide.mediaMobile),
        overlayOpacity: Number.isFinite(overlay)
          ? Math.min(100, Math.max(0, overlay))
          : undefined,
        // Anything other than an explicit "dark" is light, so slides authored
        // before this field existed — and the empty value a fresh select starts
        // on — both land on the white type the hero has always used.
        headerTone: str(slide.headerTone) === "dark" ? "dark" : "light",
      };
    });
}
