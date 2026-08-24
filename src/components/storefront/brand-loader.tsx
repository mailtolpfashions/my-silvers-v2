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
        /**
         * Deliberately NOT `preload`, and it costs nothing to skip.
         *
         * The worry is real in principle: the navigation loader appears
         * precisely BECAUSE the connection is slow, so a logo that needs its
         * own round trip would leave a large empty panel at the exact moment
         * the shopper needs to be told something is happening.
         *
         * It does not arise here. `width`/`height` match the header's mobile
         * mark exactly, so next/image resolves both to the same optimized URL —
         * verified as `…&w=384&q=75` for both — and the header has already
         * fetched it before any navigation can start. The loader's copy is a
         * cache hit.
         *
         * ⚠️  That parity is load-bearing. Change the width or add `sizes`
         * here and next/image will pick a different URL, this becomes a cold
         * fetch on a slow connection, and the panel shows empty. If this ever
         * needs a different size, preload it.
         *
         * (Chrome must also not compete with a product photograph for the
         * connection, which is the original reason — still true, now backed by
         * the parity above rather than by hope.)
         */
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
