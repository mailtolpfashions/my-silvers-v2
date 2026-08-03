/**
 * Whether Google OAuth is actually usable, rather than sitting on the
 * placeholder values from .env.example. Mirrors the self-disabling approach in
 * src/server/rate-limit/limiter.ts — a sign-in button that 500s is worse than
 * no button at all.
 *
 * Server-only: these env vars are not NEXT_PUBLIC, so this must be called from
 * a Server Component / Action, never the browser.
 */
export function isGoogleAuthConfigured(): boolean {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  return (
    clientId.endsWith(".apps.googleusercontent.com") &&
    clientSecret.startsWith("GOCSPX-")
  );
}

/**
 * `redirect` arrives from the query string, so it must never be trusted as a
 * destination — an absolute or protocol-relative URL would turn sign-in into
 * an open redirect. Only same-site absolute paths are allowed through.
 */
export function safeRedirectPath(value: string | undefined | null): string {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  return value;
}
