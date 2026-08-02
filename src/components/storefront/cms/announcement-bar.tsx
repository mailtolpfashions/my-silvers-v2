import { listPublishedEntries } from "@/server/cms/entries";

const TONE_CLASSES: Record<string, string> = {
  neutral: "bg-foreground text-background",
  sale: "bg-red-600 text-white",
  info: "bg-blue-600 text-white",
  alert: "bg-amber-500 text-black",
};

/** The first active, in-window published announcement (if any). */
export async function AnnouncementBar() {
  const announcements = await listPublishedEntries("announcement", 10);
  const now = new Date();

  const active = announcements.find((entry) => {
    const d = entry.data as {
      isActive?: boolean;
      startsAt?: string;
      endsAt?: string;
    };
    if (d.isActive === false) return false;
    if (d.startsAt && new Date(d.startsAt) > now) return false;
    if (d.endsAt && new Date(d.endsAt) < now) return false;
    return true;
  });

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
