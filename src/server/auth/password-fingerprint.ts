/**
 * A short, one-way fingerprint of the password a session signed in with.
 *
 * Stored in the session token at sign-in and compared against the CURRENT
 * password when deciding whether that session may see guest orders (see
 * accountOrderScope). It closes one specific gap: someone who set a password
 * on a stranger's unconfirmed email stays signed in, the real owner then
 * resets the password — which confirms the email — and without this the
 * squatter's still-valid session would suddenly see everything.
 *
 * Web Crypto rather than node:crypto because this runs inside the Auth.js
 * callbacks, which are shared with the proxy. A hash of the bcrypt hash, not
 * the bcrypt hash itself, because the session (and so this value) is readable
 * by the signed-in user at /api/auth/session.
 *
 * "" means "signed in without a password" (Google).
 */
export async function passwordFingerprint(passwordHash: string | null | undefined): Promise<string> {
  if (!passwordHash) return "";
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(passwordHash));
  return Array.from(new Uint8Array(bytes).slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}
