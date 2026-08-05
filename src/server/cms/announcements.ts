import { cacheLife, cacheTag } from "next/cache";
import { listPublishedEntries } from "@/server/cms/entries";

/** One line of the ticker. An announcement can contribute more than one. */
export type LiveAnnouncement = {
  id: string;
  text: string;
  tone: string;
};

/**
 * Every active, in-window published announcement, newest first.
 *
 * Lives here rather than inside the component for the same reason getLiveBanner
 * does — it is a CMS read, and the component should only decide how to draw it.
 *
 * Previously the component took only the FIRST match, so a second live
 * announcement was silently invisible: an editor could publish one and watch
 * nothing happen. They now rotate in the bar.
 *
 * The schedule check reads the clock, so the whole evaluation — not just the
 * query — lives inside the cached scope. The consequence is worth stating
 * plainly: the window is only as precise as the `announcement` cacheLife
 * profile in next.config.ts, so an announcement can outlive its end time by up
 * to that revalidate period. Shorten the profile if that ever matters.
 */
export async function getLiveAnnouncements(): Promise<LiveAnnouncement[]> {
  "use cache";
  cacheLife("announcement");
  cacheTag("cms:announcement");

  const entries = await listPublishedEntries("announcement", 10);
  const now = new Date();

  return entries.flatMap((entry): LiveAnnouncement[] => {
    const d = entry.data as {
      text?: string;
      subtext?: string;
      tone?: string;
      isActive?: boolean;
      startsAt?: string;
      endsAt?: string;
    };
    if (d.isActive === false) return [];
    if (d.startsAt && new Date(d.startsAt) > now) return [];
    if (d.endsAt && new Date(d.endsAt) < now) return [];

    const tone = d.tone ?? "neutral";

    // text and subtext become SEPARATE lines in the rotation rather than one
    // concatenated string. Together they routinely exceed the ~40 characters a
    // phone can show on one line, so the old joined form was simply truncated —
    // the subtext existed but nobody could read it.
    //
    // An empty part contributes nothing: a blank message would rotate in as an
    // empty bar and read as a rendering fault.
    return [d.text, d.subtext]
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part))
      // Suffixed because one entry can now produce two lines, and React needs
      // each to be distinct.
      .map((text, i) => ({ id: `${entry.id}:${i}`, text, tone }));
  });
}
