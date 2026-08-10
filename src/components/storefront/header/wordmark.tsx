import Image from "next/image";

/**
 * The MY Silvers lockup, in one place.
 *
 * Deliberately still the real `/logo.png` rather than a typeset imitation or a
 * hand-drawn SVG. A logo is the one asset a redesign must not invent: setting
 * "MY SILVERS" in a loaded webfont would look close enough to pass review and
 * would quietly replace the brand's actual mark with something that is not it.
 *
 * The component exists so that swapping in a proper horizontal SVG lockup —
 * which is what a 72px header really wants, and what should be commissioned —
 * is a change to this file alone rather than to the header, the drawer and the
 * footer separately.
 *
 * Two assets, not one scaled asset. The full lockup is stacked (mark above
 * wordmark) and needs vertical room; the square mark alone is what fits a 56px
 * mobile band beside three icons. Same approach as the previous storefront.
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <>
      {/* `w-auto` is load-bearing on both. next/image writes the intrinsic
          `width` attribute onto the <img>, so a height-only class leaves the
          element 192px (or 519px) wide with a letterboxed picture inside it —
          which pushed the header's icon cluster off a 390px viewport and made
          the whole document scroll sideways. Height sets the size; width
          follows. */}
      <Image
        src="/android-chrome-192x192.png"
        alt="MY Silvers"
        width={192}
        height={192}
        preload
        className={`w-auto object-contain md:hidden ${className}`}
      />
      <Image
        src="/logo.png"
        alt="MY Silvers"
        width={519}
        height={311}
        preload
        className={`hidden w-auto object-contain md:block ${className}`}
      />
    </>
  );
}
