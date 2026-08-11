import { cacheLife } from "next/cache";
import Link from "next/link";
import { NewsletterForm } from "@/components/storefront/newsletter-form";

/**
 * Reading the clock is non-deterministic, so it can't happen freely inside a
 * prerendered shell — it has to live in a cached scope with a stated lifetime.
 * A year is about as stable as content gets, so the entry can live for days.
 */
async function CopyrightYear() {
  "use cache";
  cacheLife("days");
  return <>{new Date().getFullYear()}</>;
}

/**
 * Social and contact links come from .env so they can be changed without
 * touching code. Each must be read as a literal `process.env.NEXT_PUBLIC_*`
 * expression — Next inlines these at build time and cannot resolve a dynamic
 * lookup. Any left blank simply doesn't render.
 */
const whatsappNumber = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/[^\d]/g, "");

const SOCIAL = {
  instagram: process.env.NEXT_PUBLIC_INSTAGRAM_URL ?? "",
  facebook: process.env.NEXT_PUBLIC_FACEBOOK_URL ?? "",
  youtube: process.env.NEXT_PUBLIC_YOUTUBE_URL ?? "",
};

const FOOTER_LINKS: Record<string, { label: string; href: string }[]> = {
  Shop: [
    { label: "All jewellery", href: "/products" },
    { label: "Collections", href: "/collections" },
    { label: "Rings", href: "/category/rings" },
    { label: "Earrings", href: "/category/earrings" },
    { label: "Necklaces", href: "/category/necklaces" },
    { label: "Bracelets", href: "/category/bracelets" },
    { label: "Anklets", href: "/category/anklets" },
    { label: "Pendants", href: "/category/pendants" },
  ],
  "Customer care": [
    { label: "Track your order", href: "/account/orders" },
    { label: "Shipping & delivery", href: "/p/shipping" },
    { label: "Returns & exchanges", href: "/p/returns" },
    { label: "Silver care guide", href: "/p/care-guide" },
    { label: "Your wishlist", href: "/wishlist" },
  ],
  About: [
    { label: "Our story", href: "/p/about" },
    { label: "Journal", href: "/blog" },
    { label: "Your account", href: "/account" },
  ],
};

export function SiteFooter() {
  return (
    // The inset padding matters now that the root layout opts into
    // viewport-fit: cover — the page runs under Android's gesture pill, and the
    // copyright line is the last thing on it.
    <footer className="mt-20 bg-black pb-[env(safe-area-inset-bottom)] text-white sm:mt-28">
      {/* ── The brand statement ─────────────────────────────────────────────
          One line, set large and quiet across the top of the footer. It is the
          last thing a shopper reads on any page, and the footer previously
          opened with a link list. Deliberately not a marketing claim: it says
          what the shop sells and what it is made of, both of which are facts. */}
      <div className="container-page border-b border-white/10 py-14 sm:py-20">
        <p className="max-w-2xl font-serif text-h2 leading-relaxed text-white/90">
          Hallmarked 925 sterling silver, made in India — designed to be worn
          every day rather than kept for an occasion.
        </p>
      </div>

      <div className="container-page py-14 sm:py-16">
        <div className="grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(FOOTER_LINKS).map(([heading, links]) => (
            <nav key={heading} aria-label={heading}>
              {/* .label-eyebrow, matching every other section label on the
                  site. These were an 11px/700/0.18em one-off that existed
                  nowhere else. The class colours itself --black, which is
                  tuned for AA on ivory and goes muddy here, so the lighter ramp
                  is applied over it. */}
              <h2 className="label-eyebrow mb-5 !text-white">{heading}</h2>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/70 transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <div>
            <h2 className="label-eyebrow mb-5 !text-white">Stay in touch</h2>
            <p className="mb-4 text-sm leading-relaxed text-white/70">
              New arrivals, care tips and first access to collections.
            </p>
            <NewsletterForm />

            {whatsappNumber && (
              <a
                href={`https://wa.me/${whatsappNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-2 border-b border-white/40 pb-1 text-sm text-white/80 transition-colors hover:border-white hover:text-white"
              >
                Message us on WhatsApp
              </a>
            )}

            {(SOCIAL.instagram || SOCIAL.facebook || SOCIAL.youtube) && (
              <div className="mt-8 flex items-center gap-5">
                <SocialLink href={SOCIAL.instagram} label="Instagram">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                </SocialLink>
                <SocialLink href={SOCIAL.facebook} label="Facebook">
                  <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />
                </SocialLink>
                <SocialLink href={SOCIAL.youtube} label="YouTube">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </SocialLink>
              </div>
            )}
          </div>
        </div>

        {/* ── Hallmark and payment ───────────────────────────────────────────
            Payment METHODS as words, not brand marks. Rendering Visa,
            Mastercard and UPI logos would mean shipping third-party trademarks
            as assets, and the accepted set is decided by the Razorpay account
            rather than by this component — a hardcoded row of logos would go
            stale silently. These three are what the checkout actually offers:
            Razorpay (cards, UPI, netbanking, wallets) and cash on delivery. */}
        <div className="mt-14 flex flex-col gap-6 border-t border-white/10 pt-8 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © <CopyrightYear /> MY Silvers. All rights reserved.
          </p>
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <li>BIS hallmarked 925 silver</li>
            <li aria-hidden className="text-white/25">·</li>
            <li>UPI, cards &amp; netbanking</li>
            <li aria-hidden className="text-white/25">·</li>
            <li>Cash on delivery</li>
            <li aria-hidden className="text-white/25">·</li>
            <li>Made in India</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  // Unset in .env — render nothing rather than a link to nowhere.
  if (!href) return null;

  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="text-white/70 transition-colors hover:text-white"
    >
      <svg className="size-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        {children}
      </svg>
    </Link>
  );
}
