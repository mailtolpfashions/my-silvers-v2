import "server-only";
import { toSVG } from "bwip-js/node";

/**
 * A Code 128 barcode as an SVG string — the symbology couriers' scanners read
 * (their own labels use it for the AWB). Drawn on the server, so nothing is
 * shipped to the browser. Stretches to fill its box; bars stay proportional
 * because only the width scales.
 *
 * Returns null for text Code 128 cannot carry, so a label still prints.
 */
export function code128Svg(text: string): string | null {
  try {
    return toSVG({ bcid: "code128", text, height: 10, includetext: false }).replace(
      "<svg ",
      '<svg preserveAspectRatio="none" width="100%" height="100%" '
    );
  } catch {
    return null;
  }
}
