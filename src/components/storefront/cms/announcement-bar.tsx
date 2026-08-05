import { getLiveAnnouncements } from "@/server/cms/announcements";
import { AnnouncementTicker } from "@/components/storefront/cms/announcement-ticker";

/**
 * Tones are drawn from the palette rather than raw Tailwind colours, so the bar
 * cannot drift out of the brand the way bg-red-600/bg-blue-600 did. "sale" is
 * the loud one — brass on graphite, which is the brand's own emphasis pairing
 * rather than a generic red.
 */
const TONE_CLASSES: Record<string, string> = {
  neutral: "bg-graphite-950 text-ivory-100",
  sale: "bg-brass text-graphite-950",
  info: "bg-ivory-200 text-graphite-800",
  alert: "bg-destructive text-white",
};

export async function AnnouncementBar() {
  const announcements = await getLiveAnnouncements();
  if (announcements.length === 0) return null;

  // The first live announcement sets the bar's colour for all of them — see the
  // note in AnnouncementTicker on why the tone does not rotate with the text.
  const tone = TONE_CLASSES[announcements[0].tone] ?? TONE_CLASSES.neutral;

  return <AnnouncementTicker items={announcements} className={tone} />;
}
