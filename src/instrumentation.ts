import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const enabled = !!dsn && !dsn.startsWith("your-") && process.env.NODE_ENV === "production";

export async function register() {
  if (!enabled) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({ dsn, tracesSampleRate: 0.1 });
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({ dsn, tracesSampleRate: 0.1 });
  }
}

// Captures errors thrown inside Server Components, Server Actions and
// Route Handlers — the server-side half of the unified instrumentation.
export const onRequestError = Sentry.captureRequestError;
