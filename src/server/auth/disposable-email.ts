/**
 * Disposable/throwaway email blocking for registration and newsletter signup.
 * The full blocklist (~4000 domains) is fetched from a maintained public list
 * and cached via Next's fetch cache for 24h; a small hardcoded fallback
 * covers list-fetch failures. Carried over from the old site as a cheap
 * anti-abuse measure.
 */
const BLOCKLIST_URL =
  "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf";

const FALLBACK_DOMAINS = new Set([
  "10minutemail.com", "guerrillamail.com", "mailinator.com", "tempmail.com",
  "temp-mail.org", "throwawaymail.com", "yopmail.com", "getnada.com",
  "sharklasers.com", "trashmail.com", "maildrop.cc", "dispostable.com",
  "fakeinbox.com", "mintemail.com", "mytemp.email", "tempinbox.com",
  "spamgourmet.com", "mohmal.com", "emailondeck.com", "burnermail.io",
]);

let cachedList: Set<string> | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function getBlocklist(): Promise<Set<string>> {
  if (cachedList && Date.now() - cachedAt < CACHE_TTL_MS) return cachedList;
  try {
    const res = await fetch(BLOCKLIST_URL, { next: { revalidate: 86400 } });
    if (!res.ok) throw new Error(`blocklist fetch ${res.status}`);
    const text = await res.text();
    const domains = new Set(
      text
        .split("\n")
        .map((line) => line.trim().toLowerCase())
        .filter((line) => line && !line.startsWith("#"))
    );
    if (domains.size > 100) {
      cachedList = domains;
      cachedAt = Date.now();
      return domains;
    }
  } catch (err) {
    console.warn("[disposable-email] blocklist fetch failed — using fallback list", err);
  }
  return FALLBACK_DOMAINS;
}

export async function isDisposableEmail(email: string): Promise<boolean> {
  const domain = email.trim().toLowerCase().split("@")[1];
  if (!domain) return false;
  const blocklist = await getBlocklist();
  return blocklist.has(domain);
}

export const DISPOSABLE_EMAIL_MESSAGE =
  "Disposable or temporary email addresses are not accepted.";
