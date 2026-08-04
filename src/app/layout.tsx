import type { Metadata } from "next";
import { Playfair_Display, DM_Sans, Raleway } from "next/font/google";
import "./globals.css";

// Headings — the brand's display serif.
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

// Body copy.
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});

// Brand wordmark font — matches the "MY SILVERS" logo lettering. Only the
// footer wordmark uses it, at 300; the other three weights were being
// downloaded for nothing.
const raleway = Raleway({
  variable: "--font-raleway",
  subsets: ["latin"],
  weight: ["300"],
  display: "swap",
});

// Geist Mono was dropped: a whole downloaded family for one `font-mono` order
// ID in /admin. Tailwind's default system mono stack covers that case.

export const metadata: Metadata = {
  metadataBase: new URL("https://www.mysilvers.in"),
  title: {
    default: "MY Silvers | Luxury 925 Sterling Silver Jewellery",
    template: "%s | MY Silvers",
  },
  description:
    "Shop 925 BIS hallmarked sterling silver jewellery online in India. Rings, earrings, necklaces, bracelets, anklets & more.",
  keywords: [
    "925 sterling silver jewellery",
    "BIS hallmarked silver",
    "silver rings India",
    "silver earrings online",
    "sterling silver necklace",
    "silver anklet India",
  ],
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  },
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    siteName: "MY Silvers",
  },
  twitter: {
    card: "summary_large_image",
    site: "@mysilvers",
    creator: "@mysilvers",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning is no longer needed here — it existed for
    // next-themes writing a class onto <html> before hydration.
    <html
      lang="en-IN"
      className={`${playfair.variable} ${dmSans.variable} ${raleway.variable} h-full antialiased`}
    >
      {/* Single light theme by design. There is no theme provider: next-themes
          was a client-side context wrapping every page, and the site has one
          palette, so it was pure cost. */}
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
