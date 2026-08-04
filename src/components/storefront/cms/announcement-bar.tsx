import { cacheLife, cacheTag } from "next/cache";
import { listPublishedEntries } from "@/server/cms/entries";

/**
 * Tones are drawn from the palette rather than raw Tailwind colours, so the bar
 * cannot drift out of the brand the way bg-red-600/bg-blue-600 did. "sale" is
 * the loud one — brass on graphite, which is the brand's own emphasis pairing
 * rather than a generic red.
 */
const TONE_CLASSES: Record<string, string> = {
  neutral: "bg-graphite-950 text-platinum-100",
  sale: "bg-brass text-graphite-950",
  info: "bg-platinum-200 text-graphite-800",
  alert: "bg-destructive text-white",
};

/**
 * The first active, in-window published announcement (if any).
 *
 * The schedule check reads the clock, so the whole evaluation — not just the
 * query — lives inside the cached scope. The consequence is worth stating
 * plainly: the window is only as precise as the `announcement` cacheLife
 * profile in next.config.ts, so an announcement can outlive its end time by up
 * to that revalidate period. Shorten the profile if that ever matters.
 */
async function getActiveAnnouncement() {
  "use cache";
  cacheLife("announcement");
  cacheTag("cms:announcement");

  const announcements = await listPublishedEntries("announcement", 10);
  const now = new Date();

  return (
    announcements.find((entry) => {
      const d = entry.data as {
        isActive?: boolean;
        startsAt?: string;
        endsAt?: string;
      };
      if (d.isActive === false) return false;
      if (d.startsAt && new Date(d.startsAt) > now) return false;
      if (d.endsAt && new Date(d.endsAt) < now) return false;
      return true;
    }) ?? null
  );
}

export async function AnnouncementBar() {
  const active = await getActiveAnnouncement();

  if (!active) return null;

  const data = active.data as { text?: string; subtext?: string; tone?: string };
  if (!data.text) return null;

  return (
    <div className={`px-4 py-2 text-center text-sm ${TONE_CLASSES[data.tone ?? "neutral"] ?? TONE_CLASSES.neutral}`}>
      <span className="font-medium">{data.text}</span>
      {data.subtext && <span className="ml-2 opacity-80">{data.subtext}</span>}
    </div>
  );
}
