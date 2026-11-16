/**
 * Where errors are coming from, and whether to report them at all.
 *
 * ⚠️  Reporting used to switch on for ANY production build with a DSN — and
 * the e2e suite runs against a production build (`next start`) on a developer
 * machine. Its deliberate failures then landed in the live project with
 * nothing to tell them apart: role-revocation.spec.ts demoting an admin
 * mid-session showed up as seven "FORBIDDEN" crashes, and a test's cleanup
 * racing the dashboard as a TypeError, all looking like customer-facing bugs.
 *
 * Now only Vercel deployments report, each tagged with its environment, so
 * whatever is in Sentry came from a real visitor (production) or a preview
 * link (preview) and can be filtered by which.
 *
 * Set at build time in next.config.ts from VERCEL_ENV.
 */
export const sentryEnvironment = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || "";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

export const sentryDsn = dsn && !dsn.startsWith("your-") ? dsn : undefined;

export const sentryEnabled =
  !!sentryDsn && !!sentryEnvironment && process.env.NODE_ENV === "production";
