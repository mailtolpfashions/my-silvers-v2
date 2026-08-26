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

/**
 * Content Security Policy.
 *
 * ⚠️  Deliberately NOT nonce-based. Next's own guidance generates a per-request
 * nonce in the proxy, and states plainly that doing so "must use dynamic
 * rendering" — which would opt every page out of the static shell that
 * `cacheComponents` exists to produce. On a shop whose cheapest traffic by far
 * is anonymous browsing off a prerendered shell, buying a stricter script
 * policy with the entire PPR architecture is the wrong trade.
 *
 * So this is a static policy shipped as a header, and the cost is explicit:
 * `script-src` needs 'unsafe-inline' because Next emits inline bootstrap and
 * flight-data scripts with no nonce to mark them with. That is materially
 * weaker than a nonce policy against injected script — it is bought back with
 * `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` and a locked
 * `frame-ancestors`, which close the escalation routes an XSS would reach for.
 *
 * Rolled out as Report-Only first (see the header key below). Watch the browser
 * console on checkout, the CMS editor and the media library — those are the
 * three places that load third-party origins — then switch the key to
 * `Content-Security-Policy` to enforce.
 */
const isDev = process.env.NODE_ENV !== "production";

/**
 * `frameAncestors` is a parameter for exactly one route: the CMS live preview,
 * which is DESIGNED to be framed by the editor beside it. Everywhere else it is
 * 'none'. See PREVIEW_HEADERS.
 */
const csp = (frameAncestors: "'none'" | "'self'") => [
  "default-src 'self'",
  // 'unsafe-inline': see the note above. 'unsafe-eval' is dev-only — React uses
  // eval to rebuild server error stacks in the browser; production needs neither.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://checkout.razorpay.com`,
  // Tailwind ships a stylesheet, but Next still injects inline <style> during
  // streaming, and next/font writes inline @font-face blocks.
  "style-src 'self' 'unsafe-inline'",
  // blob: and data: are needed by next/image and the Cloudinary upload widget's
  // client-side preview before bytes leave the browser.
  "img-src 'self' data: blob: https://res.cloudinary.com https://*.cdninstagram.com https://*.fbcdn.net https://placehold.co",
  // next/font/google self-hosts at build time, so no external font origin here.
  "font-src 'self' data:",
  // Razorpay's checkout posts telemetry to lumberjack; Cloudinary receives the
  // direct browser upload; Sentry receives errors from instrumentation-client.
  "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com https://api.cloudinary.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io",
  // Razorpay Checkout.js mounts its payment UI in an iframe on our page.
  "frame-src https://api.razorpay.com https://checkout.razorpay.com",
  "media-src 'self' https://res.cloudinary.com",
  "worker-src 'self' blob:",
  // The clickjacking gate, and the modern replacement for X-Frame-Options
  // (both are sent; old browsers read only the latter).
  `frame-ancestors ${frameAncestors}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const CSP = csp("'none'");

const SECURITY_HEADERS = [
  // Report-Only while the policy is validated against the real third parties.
  // Rename to "Content-Security-Policy" to enforce.
  { key: "Content-Security-Policy-Report-Only", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(self), interest-cohort=()",
  },
  // Two years, subdomains included, and preload-eligible. Only ever sent over
  // HTTPS by the browser's own rules, so it is inert on localhost.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/**
 * The CMS live preview, and nothing else.
 *
 * ⚠️  `X-Frame-Options: DENY` refuses framing from EVERY origin, our own
 * included — there is no same-origin exemption in that header, which is the
 * usual surprise. So the editor's preview pane, an iframe pointing at our own
 * /preview route, rendered as "localhost refused to connect".
 *
 * SAMEORIGIN here rather than dropping the header: the preview may be framed by
 * this site and still by nobody else. Narrow on three counts — the route is
 * gated to admin and editor in proxy.ts, it takes its content only from
 * same-origin postMessage and never from a URL, and it displays a draft the
 * author is already looking at. There is no clickjacking value in a page that
 * shows you your own unsaved words.
 *
 * Everything else keeps DENY.
 */
const PREVIEW_HEADERS = SECURITY_HEADERS.map((header) =>
  header.key === "X-Frame-Options"
    ? { key: header.key, value: "SAMEORIGIN" }
    : header.key === "Content-Security-Policy-Report-Only"
      ? { key: header.key, value: csp("'self'") }
      : header
);

const nextConfig: NextConfig = {
  // Drops the "X-Powered-By: Next.js" fingerprint from every response.
  poweredByHeader: false,

  async headers() {
    return [
      // ⚠️  MUST NOT OVERLAP with the blanket rule below. Next applies the
      // headers of EVERY matching entry, so two matches would send two
      // X-Frame-Options headers — and a browser seeing both DENY and SAMEORIGIN
      // takes the most restrictive, silently leaving the preview broken. Hence
      // the negative lookahead rather than ordering.
      { source: "/preview/:path*", headers: PREVIEW_HEADERS },
      { source: "/((?!preview/).*)", headers: SECURITY_HEADERS },
    ];
  },

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

    // Store settings (COD on/off, guest checkout, shipping rates). Short
    // despite changing rarely, because what it gates is money and payment
    // availability: the admin save calls updateTag, so this window only
    // governs a row edited outside the app — and 60s is how long a shop would
    // then keep quoting the old shipping charge.
    settings: { stale: 30, revalidate: 60, expire: 300 },
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
  },

  // NOTE: `experimental.viewTransition` used to live here, enabling React's
  // <ViewTransition> for the product card → product page morph. Next 16.3
  // removed the flag because the feature graduated — view transitions now work
  // in the App Router with no configuration at all. The morph still works; the
  // key is gone, and setting it is a type error.
};

// Sourcemap upload only runs when SENTRY_AUTH_TOKEN is a real value, so local
// and unconfigured builds are unaffected.
const sentryEnabled =
  !!process.env.SENTRY_AUTH_TOKEN && !process.env.SENTRY_AUTH_TOKEN.startsWith("your-");

export default withSentryConfig(nextConfig, {
  silent: !sentryEnabled,
  // Was `disableLogger: true`, which the SDK now warns is deprecated. Same
  // effect — Sentry's debug logging is tree-shaken out of the client bundle.
  webpack: { treeshake: { removeDebugLogging: true } },
  telemetry: false,
  sourcemaps: { disable: !sentryEnabled },
});
