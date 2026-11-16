import * as Sentry from "@sentry/nextjs";
import { sentryDsn, sentryEnabled, sentryEnvironment } from "@/lib/sentry-environment";

// Client-side error + performance tracking. The old site had NO frontend
// error visibility at all (server-only Express SDK) — this closes that gap.
// Only initialises on a Vercel deployment — see lib/sentry-environment.ts.
if (sentryEnabled) {
  Sentry.init({
    dsn: sentryDsn,
    environment: sentryEnvironment,
    tracesSampleRate: 0.1,
    ignoreErrors: [
      // Noise filters carried over from the old site's config.
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      // The browser cancelling a page-transition animation because the tab
      // was hidden mid-navigation. Nothing breaks; the page simply arrives
      // without the animation.
      "Transition was aborted because of invalid state",
      // Not this site's code: a script injected into a visitor's browser
      // (an extension) calling a method that doesn't exist on its own object.
      "has no method 'updateFrom'",
    ],
    denyUrls: [/extensions\//i, /^chrome:\/\//i, /^moz-extension:\/\//i, /connect\.facebook\.net/i],
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
