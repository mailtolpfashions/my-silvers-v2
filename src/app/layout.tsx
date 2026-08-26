import type { Metadata, Viewport } from "next";
import { Playfair_Display, DM_Sans, Raleway } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
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

/**
 * `viewport-fit: cover` is what makes `env(safe-area-inset-*)` report real
 * numbers. Without it the insets are hard 0 in every browser, and Chrome on
 * Android 15+ draws the page edge to edge anyway — so the bottom ~24px of any
 * `fixed bottom-0` bar sits underneath the system gesture pill and is both
 * clipped and untappable. Anything pinned to the bottom must pad itself by
 * `env(safe-area-inset-bottom)`; see sticky-action-bar.tsx.
 */
export const viewport: Viewport = {
  viewportFit: "cover",
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
      <body className="min-h-full flex flex-col">
        {children}
        {/*
          ⚠️  This was MISSING, and had been for as long as the code has used
          toasts. `components/ui/sonner.tsx` exported a Toaster that nothing
          rendered, so every `toast.success(...)` and `toast.error(...)` in the
          app resolved happily and drew nothing — 47 calls across the admin and
          Studio alone, plus the storefront's wishlist, cart and checkout.

          Failures were the worse half: "Could not add to cart", "Upload
          failed", "Please choose a size first" all fired into a void, so an
          action that failed looked exactly like one that had not registered.

          Mounted once in the ROOT layout rather than per-surface: the
          storefront, /admin and /cms are separate route groups with separate
          layouts, and a per-layout Toaster would have to be added to each and
          remembered for the next one. `richColors` so success and failure are
          distinguishable at a glance, and a longer duration than the 4s default
          because several of these carry a "View cart" action worth reaching.
        */}
        {/**
         * ⚠️  No `richColors`, and no `closeButton`.
         *
         * `richColors` is what made a "Added to wishlist" toast arrive green
         * with a green tick — sonner's own success palette, on a shop whose
         * entire identity is achromatic. It meant the single most saturated
         * colour a shopper ever saw belonged to a component library rather than
         * to the brand, and it is the specific thing that made the site read as
         * assembled from parts.
         *
         * Colour is not how this shop says "done" — the words and the mark do
         * that. The one place colour still carries meaning is failure, which is
         * a hazard and needs to be unmissable; see --destructive.
         *
         * `closeButton` went with it. A toast that dismisses itself in five
         * seconds does not need a control, and the × was drawing the eye to the
         * least useful thing in the notification.
         */}
        <Toaster position="bottom-right" duration={5000} />
      </body>
    </html>
  );
}
