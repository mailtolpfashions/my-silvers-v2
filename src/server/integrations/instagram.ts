export type InstagramPost = {
  id: string;
  caption: string | null;
  permalink: string;
  imageUrl: string;
};

/**
 * Instagram Graph API feed. Uses Next's own fetch cache (30 min) instead of
 * the old site's Redis-backed cache — no external cache dependency at all.
 * Any failure degrades to an empty feed (the homepage section hides itself),
 * never an error page.
 *
 * NOTE: INSTAGRAM_ACCESS_TOKEN is a long-lived token that expires roughly
 * every 60 days and must be rotated manually — same operational caveat as the
 * old site, no auto-refresh implemented.
 */
export async function getInstagramFeed(limit = 8): Promise<InstagramPost[]> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!token || !accountId || token.startsWith("your-")) return [];

  const url =
    `https://graph.facebook.com/v21.0/${accountId}/media` +
    `?fields=id,caption,media_type,media_url,thumbnail_url,permalink` +
    `&limit=${limit}&access_token=${token}`;

  try {
    const res = await fetch(url, {
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Instagram API ${res.status}`);

    const json = (await res.json()) as {
      data?: Array<{
        id: string;
        caption?: string;
        media_type?: string;
        media_url?: string;
        thumbnail_url?: string;
        permalink?: string;
      }>;
    };

    return (json.data ?? [])
      .map((post) => ({
        id: post.id,
        caption: post.caption ?? null,
        permalink: post.permalink ?? "",
        // Videos expose a poster frame via thumbnail_url.
        imageUrl: (post.media_type === "VIDEO" ? post.thumbnail_url : post.media_url) ?? "",
      }))
      .filter((post) => post.imageUrl && post.permalink);
  } catch (err) {
    console.error("[instagram] feed fetch failed", err);
    return [];
  }
}
