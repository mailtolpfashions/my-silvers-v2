import type { Metadata } from "next";
import { Playfair_Display, DM_Sans, Raleway, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
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

// Brand wordmark font — matches the "MY SILVERS" logo lettering.
const raleway = Raleway({
  variable: "--font-raleway",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
    <html
      lang="en-IN"
      className={`${playfair.variable} ${dmSans.variable} ${raleway.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* defaultTheme="light" keeps the storefront's current appearance until
            a theme toggle is added — flip enableSystem on when it is. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
