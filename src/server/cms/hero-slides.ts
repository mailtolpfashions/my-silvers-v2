import type { HeroSlide } from "@/components/storefront/hero-carousel";
import type { EntryData } from "@/server/cms/types";

type PublishedEntry = { id: string; slug: string; data: EntryData };

const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value : undefined;

/**
 * Maps published `heroSlide` entries onto the carousel's props: drops inactive
 * slides and ones with no headline, then orders by the editor's sortOrder.
 * listPublishedEntries sorts by publishedAt, which is not the order an editor
 * expects to control.
 */
export function toHeroSlides(entries: PublishedEntry[]): HeroSlide[] {
  return entries
    .filter((entry) => {
      const d = entry.data as { isActive?: boolean; headline?: unknown };
      if (d.isActive === false) return false;
      return Boolean(str(d.headline));
    })
    .sort((a, b) => {
      const ao = Number((a.data as { sortOrder?: unknown }).sortOrder ?? 0);
      const bo = Number((b.data as { sortOrder?: unknown }).sortOrder ?? 0);
      return ao - bo;
    })
    .map((entry) => {
      const d = entry.data as Record<string, unknown>;
      const overlay = Number(d.overlayOpacity);
      return {
        id: entry.id,
        eyebrow: str(d.eyebrow),
        headline: str(d.headline)!,
        subline: str(d.subline),
        ctaLabel: str(d.ctaLabel),
        ctaHref: str(d.ctaHref),
        secondaryLabel: str(d.secondaryLabel),
        secondaryHref: str(d.secondaryHref),
        media: str(d.media),
        overlayOpacity: Number.isFinite(overlay) ? Math.min(100, Math.max(0, overlay)) : undefined,
      };
    });
}
