import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Production image host — Cloudinary CDN (product images, CMS media)
      { protocol: "https", hostname: "res.cloudinary.com" },
      // Instagram/Meta CDN — homepage feed images served via the Graph API
      { protocol: "https", hostname: "*.cdninstagram.com" },
      { protocol: "https", hostname: "*.fbcdn.net" },
      // Dev-only placeholders
      ...(isDev ? [{ protocol: "https" as const, hostname: "placehold.co" }] : []),
    ],
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
