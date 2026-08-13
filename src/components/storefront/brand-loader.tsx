import Image from "next/image";

/**
 * The loading mark: the MY Silvers logo, breathing.
 *
 * The square `android-chrome` asset rather than the stacked lockup in
 * wordmark.tsx — the lockup is mark-above-wordmark and needs vertical room it
 * will not get in a small centred indicator, and at 48px its type is unreadable
 * anyway. Same reasoning as the header's mobile band.
 *
 * No spinner ring around it. A rotating border plus a pulsing logo is two
 * loading languages in one control, and the brand mark is the point here.
 *
 * The motion is `.brand-loader-pulse` in globals.css, which stops under
 * prefers-reduced-motion — the mark stays visible and simply does not move, so
 * the indicator still indicates.
 */
export function BrandLoader({
  /** Rendered px. The asset is 192 square, so anything up to that is crisp. */
  size = 56,
  label = "Loading",
}: {
  size?: number;
  label?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <Image
        src="/android-chrome-192x192.png"
        alt=""
        aria-hidden
        width={192}
        height={192}
        // Not `preload` — this is chrome, and it must never compete with a
        // product photograph for the connection.
        className="brand-loader-pulse h-auto object-contain"
        style={{ width: size }}
      />
      {/* The status text is for screen readers only: a shopper can see the mark,
          and a visible "Loading…" under a logo turns a quiet indicator into a
          notice. role=status announces it without stealing focus. */}
      <span role="status" className="sr-only">
        {label}
      </span>
    </div>
  );
}
