import Link from "next/link";
import { getLiveAnnouncements } from "@/server/cms/announcements";
import { AnnouncementTicker } from "@/components/storefront/cms/announcement-ticker";
import { buildUtilityLinks } from "@/components/storefront/header/nav-model";

/**
 * Tones are drawn from the palette rather than raw Tailwind colours, so the bar
 * cannot drift out of the brand the way bg-red-600/bg-blue-600 did. "sale" is
 * the loud one — brass on graphite, which is the brand's own emphasis pairing
 * rather than a generic red.
 */
const TONE_CLASSES: Record<string, string> = {
  neutral: "bg-graphite-950 text-ivory-100",
  // `sale` emphasises with brass TEXT on the same graphite band, not with a
  // brass fill. A full-width brass strip across the top of every page is the
  // "large promotional block" the palette rule forbids — --brass is a 1px rule,
  // an underline, a dot or a focus ring, never a field behind copy. This still
  // reads as louder than neutral without turning the header into a sale banner.
  sale: "bg-graphite-950 text-brass-light",
  info: "bg-ivory-200 text-graphite-800",
  alert: "bg-destructive text-white",
};

/**
 * The header's first band: the CMS announcement on the left, service links on
 * the right.
 *
 * This is where the third navigation row went. The header used to be an
 * announcement strip, an 80px logo/search/icons row and a 57px category row —
 * roughly 150px of chrome before a shopper saw a photograph. Folding the
 * service links into the announcement strip and moving category depth into the
 * mega panels buys that row back on every page.
 *
 * The band renders even with no live announcement, as long as there are links
 * to show: an empty 32px strip is invisible, whereas the links jumping between
 * two rows depending on whether a sale is running is not.
 */
export async function UtilityBar() {
  const [announcements, utilityLinks] = await Promise.all([
    getLiveAnnouncements(),
    buildUtilityLinks(),
  ]);

  if (announcements.length === 0 && utilityLinks.length === 0) return null;

  // The first live announcement sets the band's colour for all of them — see
  // the note in AnnouncementTicker on why the tone does not rotate with the
  // text. With no announcement at all the band takes the neutral tone.
  const tone = TONE_CLASSES[announcements[0]?.tone ?? "neutral"] ?? TONE_CLASSES.neutral;

  return (
    // `header-band` is the hook the transparent-over-hero header uses to drop
    // this band's fill — see globals.css. Without it the graphite strip would
    // stay painted across the top of the artwork while everything below it went
    // transparent, which reads as a bug rather than a design. Keep the class on
    // whichever element carries the tone.
    <div className={`header-band ${tone}`}>
      <div className="container-page flex h-8 items-center justify-between gap-6 text-xs">
        {announcements.length > 0 ? (
          <AnnouncementTicker
            items={announcements}
            // Centred on a phone where it is the only thing in the band, left
            // aligned from lg where the service links occupy the right.
            className="min-w-0 flex-1 text-center lg:text-left"
          />
        ) : (
          <span />
        )}

        {/* Desktop only. On a phone these live at the foot of the drawer —
            see mobile-nav.tsx. */}
        {utilityLinks.length > 0 && (
          <nav aria-label="Customer service" className="hidden shrink-0 lg:block">
            <ul className="flex items-center gap-6">
              {utilityLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="opacity-80 transition-opacity hover:opacity-100"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}

/** Reserves the band's exact height so the page below doesn't shift. */
export function UtilityBarSkeleton() {
  return <div className="header-band h-8 bg-graphite-950" aria-hidden />;
}
