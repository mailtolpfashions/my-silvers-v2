import * as Sentry from "@sentry/nextjs";
import { sentryDsn, sentryEnabled, sentryEnvironment } from "@/lib/sentry-environment";

export async function register() {
  // Vercel deployments only — see lib/sentry-environment.ts.
  if (!sentryEnabled) return;

  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({ dsn: sentryDsn, environment: sentryEnvironment, tracesSampleRate: 0.1 });
  }
}

// Captures errors thrown inside Server Components, Server Actions and
// Route Handlers — the server-side half of the unified instrumentation.
export const onRequestError = Sentry.captureRequestError;
