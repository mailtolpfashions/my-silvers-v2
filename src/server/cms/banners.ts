import { cacheLife, cacheTag } from "next/cache";
import { listPublishedEntries } from "@/server/cms/entries";

export type LiveBanner = {
  title?: string;
  image: string;
  link?: string;
};

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v : undefined;

/**
 * The clock, inside a cached scope. Schedule windows are therefore only as
 * precise as the `scheduled` cacheLife profile in next.config.ts — a banner can
 * linger past its end time by up to that revalidate period.
 */
export async function scheduleNow(): Promise<Date> {
  "use cache";
  cacheLife("scheduled");
  return new Date();
}

/** A banner is live only when active and inside its scheduled window. */
export function isBannerLive(data: Record<string, unknown>, now: Date): boolean {
  if (data.isActive === false) return false;
  const startsAt = str(data.startsAt);
  const endsAt = str(data.endsAt);
  if (startsAt && new Date(startsAt) > now) return false;
  if (endsAt && new Date(endsAt) < now) return false;
  return true;
}

/**
 * The first live banner for a position, or null.
 *
 * Shared by the homepage's banner section and category pages. It used to live
 * inline in the homepage resolver, which meant `position: "category"` was an
 * option an editor could pick that nothing anywhere consumed — the banner saved
 * fine and then never appeared.
 */
export async function getLiveBanner(position: string): Promise<LiveBanner | null> {
  const [entries, now] = await Promise.all([
    listPublishedEntries("banner", 20),
    scheduleNow(),
  ]);

  const match = entries.find((entry) => {
    const d = entry.data as Record<string, unknown>;
    return str(d.position) === position && isBannerLive(d, now) && str(d.image);
  });
  if (!match) return null;

  const d = match.data as Record<string, unknown>;
  return { title: str(d.title), image: str(d.image)!, link: str(d.link) };
}

/**
 * The banner for one category page.
 *
 * Editors set position `category` and optionally a `categorySlug`. A banner
 * naming this category wins; one with a blank slug is the catch-all, so a
 * single asset can cover every category page.
 */
export async function getCategoryBanner(slug: string): Promise<LiveBanner | null> {
  "use cache";
  cacheLife("scheduled");
  cacheTag("cms:banner");

  const [entries, now] = await Promise.all([
    listPublishedEntries("banner", 20),
    scheduleNow(),
  ]);

  const candidates = entries.filter((entry) => {
    const d = entry.data as Record<string, unknown>;
    return str(d.position) === "category" && isBannerLive(d, now) && str(d.image);
  });

  const targeted = candidates.find(
    (e) => str((e.data as Record<string, unknown>).categorySlug)?.toLowerCase() === slug
  );
  const catchAll = candidates.find(
    (e) => !str((e.data as Record<string, unknown>).categorySlug)
  );

  const match = targeted ?? catchAll;
  if (!match) return null;

  const d = match.data as Record<string, unknown>;
  return { title: str(d.title), image: str(d.image)!, link: str(d.link) };
}
