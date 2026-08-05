import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

/**
 * Whether next/image may load the demo catalogue's placeholder host.
 *
 * 119 of the 120 seeded products point at placehold.co, so blocking it leaves a
 * shop full of broken images. The real site should never render images from a
 * host we do not control — but "the real site" is not the same as "a production
 * build". A demo deployed from main is a production build and still needs them.
 *
 * So it is an explicit opt-in rather than anything inferred: set
 * ALLOW_PLACEHOLDER_IMAGES=1 on a demo project, leave it unset on the live one.
 * Local development allows it without the flag, because that is where the demo
 * data is always used.
 */
const allowPlaceholderImages =
  process.env.ALLOW_PLACEHOLDER_IMAGES === "1" || process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  // Partial Prerendering: a static shell served from the edge, with per-shopper
  // holes streamed in. In Next 16 this flag is the only route to PPR —
  // experimental.ppr was removed. Top-level, not under `experimental`.
  cacheComponents: true,

  // Short profiles for content whose visibility window is evaluated inside a
  // cached scope (announcement bar, scheduled banners). The trade is explicit:
  // window granularity equals the revalidate period, so a banner can linger for
  // up to `revalidate` seconds past its end time.
  cacheLife: {
    announcement: { stale: 60, revalidate: 300, expire: 3600 },
    scheduled: { stale: 60, revalidate: 600, expire: 3600 },
  },

  images: {
    // Next 16 changed the default from "any quality" to [75] only, and coerces
    // anything else to the nearest allowed value. 90 is here for hero and
    // product-detail imagery, where compression artefacts on metal are visible.
    qualities: [75, 90],

    // AVIF first, WebP as the fallback. Slower to encode and it doubles the
    // stored variants, but jewellery photography is exactly the gradient-heavy
    // content AVIF handles best.
    formats: ["image/avif", "image/webp"],

    // Far above the 4h v16 default. Safe here specifically because Cloudinary
    // public IDs change whenever an asset changes — there is no separate
    // invalidation step that a long TTL could outlive.
    minimumCacheTTL: 2678400,

    // Trims the top of the default ladder: nothing on the storefront is served
    // at 3840px, and every entry costs srcset bytes and optimizer variants.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],

    remotePatterns: [
      // Production image host — Cloudinary CDN (product images, CMS media)
      { protocol: "https", hostname: "res.cloudinary.com" },
      // Instagram/Meta CDN — homepage feed images served via the Graph API
      { protocol: "https", hostname: "*.cdninstagram.com" },
      { protocol: "https", hostname: "*.fbcdn.net" },
      // Demo catalogue placeholders — opt-in, see allowPlaceholderImages.
      ...(allowPlaceholderImages
        ? [{ protocol: "https" as const, hostname: "placehold.co" }]
        : []),
    ],
  },

  experimental: {
    // Capped deliberately. Next defaults to one worker per core (19 on a
    // 20-core box) and each spawns its own Prisma client; page-data collection
    // then opens more Postgres connections than the pool allows and the build
    // dies with a native crash (0xC0000409) rather than a JS error.
    cpus: 4,

    // radix-ui is installed as the monolithic package, so barrel-file imports
    // pull far more than they use. lucide-react is deliberately NOT listed —
    // Next optimizes it by default already.
    optimizePackageImports: ["radix-ui", "@tiptap/react", "@tiptap/starter-kit"],

    // Enables React's <ViewTransition>, used for the product card → product
    // page morph. Browser-driven, so it costs nothing in the client bundle.
    viewTransition: true,
  },
};

// Sourcemap upload only runs when SENTRY_AUTH_TOKEN is a real value, so local
// and unconfigured builds are unaffected.
const sentryEnabled =
  !!process.env.SENTRY_AUTH_TOKEN && !process.env.SENTRY_AUTH_TOKEN.startsWith("your-");

export default withSentryConfig(nextConfig, {
  silent: !sentryEnabled,
  disableLogger: true,
  telemetry: false,
  sourcemaps: { disable: !sentryEnabled },
});
