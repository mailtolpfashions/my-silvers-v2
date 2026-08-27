import { test, expect, type Page } from "@playwright/test";

/**
 * Every gap between homepage sections is the same size.
 *
 * ── Why this is a test and not a code review note ───────────────────────────
 * The spacing is not written in one place. Each section kind pads itself, some
 * are full-bleed and pad nothing, `.fit-viewport` overrides the rhythm to fit
 * one screen, and the gap a shopper sees is the SUM of two neighbours. Nothing
 * in the source shows that sum, so the page drifted to gaps of 48, 80, 96, 128
 * and 160px depending on which two kinds happened to be adjacent — visible to
 * anyone scrolling, invisible in every file.
 *
 * Geometry from a real browser is the only honest measure of it.
 *
 * ⚠️  Two seams are excluded, both deliberately:
 *   - the hero seam, where the pinned reveal pulls the first section up by
 *     100svh on purpose, so the number is large and negative;
 *   - the story section's, which is a full-bleed photograph with its text
 *     inset near the top. The space below that text is picture, not emptiness,
 *     and measuring it as a gap is measuring the artwork.
 */
async function gaps(page: Page, width: number, height: number): Promise<number[]> {
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const rows = await page.evaluate(() => {
    const host = document.querySelector(".page-over-hero");
    if (!host) return [];
    return Array.from(host.children).flatMap((el) => {
      if (el.getBoundingClientRect().height < 40) return [];
      let top = Infinity;
      let bottom = -Infinity;
      for (const node of el.querySelectorAll("h1,h2,h3,p,a,img,li,button")) {
        const r = node.getBoundingClientRect();
        if (r.height < 4 || r.width < 4) continue;
        top = Math.min(top, r.top + window.scrollY);
        bottom = Math.max(bottom, r.bottom + window.scrollY);
      }
      if (!Number.isFinite(top)) return [];
      const img = el.querySelector("img");
      const imgRect = img?.getBoundingClientRect();
      return {
        top,
        bottom: Math.max(bottom, imgRect ? imgRect.bottom + window.scrollY : -Infinity),
        /**
         * A section whose content reaches both viewport edges is a full-bleed
         * photograph rather than a padded block. Its lower edge is the picture,
         * so the space under it is artwork and not a seam — measuring it is
         * measuring the image. Everything else sits inside `container-page` and
         * comes out narrower than the viewport.
         */
        fullBleed: Math.round(imgRect?.width ?? 0) >= window.innerWidth - 24,
      };
    });
  });

  const out: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    // The hero pull is a deliberate -100svh; a full-bleed picture has no seam.
    if (rows[i - 1].fullBleed) continue;
    const gap = Math.round(rows[i].top - rows[i - 1].bottom);
    if (gap < 0) continue;
    out.push(gap);
  }
  return out;
}

for (const [name, width, height] of [
  ["desktop", 1440, 900],
  ["mobile", 390, 844],
] as const) {
  test(`homepage section gaps are uniform — ${name}`, async ({ page }) => {
    const measured = await gaps(page, width, height);
    expect(measured.length, "no measurable section seams on the homepage").toBeGreaterThan(3);

    const distinct = [...new Set(measured)].sort((a, b) => a - b);
    expect(
      distinct,
      `section gaps disagree at ${name}: ${distinct.join(", ")}px. One section is padding itself differently from the rest — see the .page-over-hero rhythm rule in globals.css.`
    ).toHaveLength(1);
  });
}
