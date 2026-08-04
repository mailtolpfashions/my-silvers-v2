import { ImageResponse } from "next/og";

export const alt = "MY Silvers — 925 BIS hallmarked sterling silver jewellery";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The site-wide social card. There wasn't one, so every link shared on
 * WhatsApp — which is where most Indian jewellery links get shared — rendered
 * as a bare URL with no image.
 *
 * Drawn rather than a static file so it stays in step with the palette. Colours
 * are literal hex: ImageResponse renders in an isolated Satori context with no
 * access to the stylesheet, so CSS variables would resolve to nothing.
 */
export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#f7f8f9", // --platinum-100
          color: "#12161a", // --graphite-950
        }}
      >
        <div
          style={{
            fontSize: 30,
            letterSpacing: 14,
            textTransform: "uppercase",
            color: "#856a31", // --brass-text
          }}
        >
          MY Silvers
        </div>

        <div
          style={{
            marginTop: 34,
            fontSize: 82,
            lineHeight: 1.05,
            textAlign: "center",
            maxWidth: 900,
          }}
        >
          Crafted in 925. Worn every day.
        </div>

        {/* The brass hairline that closes a heading block across the site. */}
        <div style={{ marginTop: 40, width: 90, height: 2, background: "#c9a96e" }} />

        <div style={{ marginTop: 38, fontSize: 27, color: "#5c666d" }}>
          BIS hallmarked sterling silver · Made in India
        </div>
      </div>
    ),
    size
  );
}
