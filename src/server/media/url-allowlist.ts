/**
 * Only URLs from trusted media hosts may be persisted into product/category/
 * CMS image fields — arbitrary external URLs are rejected at write time.
 * Mirror of next.config.ts images.remotePatterns.
 */
const ALLOWED_HOSTS = new Set(["res.cloudinary.com"]);
const DEV_HOSTS = new Set(["placehold.co"]);

export function isAllowedMediaUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (ALLOWED_HOSTS.has(parsed.hostname)) return true;
  // The same opt-in as next.config.ts's allowPlaceholderImages, so what can be
  // SHOWN and what can be SAVED agree. Before, a local production build (the
  // e2e server) displayed the placeholder demo catalogue but refused to save
  // any of its products. The live project never sets the flag, so there
  // placehold.co is still refused here — this stays one of the guards that
  // keep demo data out of the real catalogue.
  const placeholdersAllowed =
    process.env.NODE_ENV !== "production" || process.env.ALLOW_PLACEHOLDER_IMAGES === "1";
  if (placeholdersAllowed && DEV_HOSTS.has(parsed.hostname)) return true;
  return false;
}

export function assertAllowedMediaUrls(urls: string[], label: string) {
  for (const url of urls) {
    if (!isAllowedMediaUrl(url)) {
      throw new Error(`${label} URL not allowed: only Cloudinary-hosted media may be stored.`);
    }
  }
}
