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
 * Social links come from .env so they can be changed without touching code.
 * Each must be read as a literal `process.env.NEXT_PUBLIC_*` expression —
 * Next inlines these at build time and cannot resolve a dynamic lookup.
 * Any left blank simply doesn't render an icon.
 */
const whatsappNumber = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/[^\d]/g, "");

const SOCIAL = {
  instagram: process.env.NEXT_PUBLIC_INSTAGRAM_URL ?? "",
  facebook: process.env.NEXT_PUBLIC_FACEBOOK_URL ?? "",
  youtube: process.env.NEXT_PUBLIC_YOUTUBE_URL ?? "",
  whatsapp: whatsappNumber ? `https://wa.me/${whatsappNumber}` : "",
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
  Support: [
    { label: "Track your order", href: "/account/orders" },
    { label: "Shipping & delivery", href: "/p/shipping" },
    { label: "Returns & exchanges", href: "/p/returns" },
    { label: "Silver care guide", href: "/p/care-guide" },
    { label: "Your wishlist", href: "/wishlist" },
  ],
  Company: [
    { label: "About us", href: "/p/about" },
    { label: "Journal", href: "/blog" },
    { label: "Your account", href: "/account" },
  ],
};

export function SiteFooter() {
  return (
    <footer className="mt-10 bg-graphite-950 text-white sm:mt-16">
      <div className="container-page py-10 sm:py-16">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-5">
          {/* Brand column — the logo is dark-on-transparent and would vanish on
              this background, so the wordmark is set in Raleway instead. */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="mb-4 inline-block">
              <span className="font-brand text-xl font-light uppercase tracking-[0.2em]">
                MY <span className="text-brass">Silvers</span>
              </span>
            </Link>
            <p className="mb-6 max-w-[240px] text-base leading-relaxed text-white/75">
              BIS hallmarked 925 sterling silver — rings, earrings and everyday
              pieces, crafted to be worn daily.
            </p>

            <div className="flex items-center gap-4">
              <SocialLink href={SOCIAL.instagram} label="Instagram">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </SocialLink>
              <SocialLink href={SOCIAL.facebook} label="Facebook">
                <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />
              </SocialLink>
              <SocialLink href={SOCIAL.youtube} label="YouTube">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </SocialLink>
              <SocialLink href={SOCIAL.whatsapp} label="WhatsApp">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 016.988 2.896 9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.334.101 11.892c0 2.096.549 4.142 1.595 5.945L0 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.582 0 11.94-5.335 11.944-11.893a11.821 11.821 0 00-3.417-8.402" />
              </SocialLink>
            </div>
          </div>

          {Object.entries(FOOTER_LINKS).map(([heading, links]) => (
            <div key={heading}>
              <h3 className="mb-5 text-[11px] font-bold uppercase tracking-[0.18em] text-brass-light">
                {heading}
              </h3>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-base text-white/75 transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="col-span-2 md:col-span-1">
            <h3 className="mb-5 text-[11px] font-bold uppercase tracking-[0.18em] text-brass-light">
              Newsletter
            </h3>
            <p className="mb-3 text-base text-white/75">
              New arrivals, offers and care tips — no spam.
            </p>
            <NewsletterForm />
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-sm text-white/70 sm:flex-row">
          <p>
            © <CopyrightYear /> MY Silvers. All rights reserved.
          </p>
          <p>BIS Hallmarked 925 Sterling Silver · Made in India</p>
        </div>
      </div>
    </footer>
  );
}

function SocialLink({
  href,
  label,
  children,
  hoverClass = "hover:text-brass-light",
}: {
  href: string;
  label: string;
  children: React.ReactNode;
  hoverClass?: string;
}) {
  // Unset in .env — render nothing rather than a link to nowhere.
  if (!href) return null;

  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={`text-white/75 transition-colors ${hoverClass}`}
    >
      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        {children}
      </svg>
    </Link>
  );
}
