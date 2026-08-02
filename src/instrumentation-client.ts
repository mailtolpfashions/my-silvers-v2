import * as Sentry from "@sentry/nextjs";

// Client-side error + performance tracking. The old site had NO frontend
// error visibility at all (server-only Express SDK) — this closes that gap.
// Only initialises in production with a real DSN configured.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn && !dsn.startsWith("your-") && process.env.NODE_ENV === "production") {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    // Noise filters carried over from the old site's config.
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
    ],
    denyUrls: [/extensions\//i, /^chrome:\/\//i, /^moz-extension:\/\//i, /connect\.facebook\.net/i],
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
