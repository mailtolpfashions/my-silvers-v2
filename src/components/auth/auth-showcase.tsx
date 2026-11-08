import Image from "next/image";
import Link from "next/link";
import { getLiveBanner } from "@/server/cms/banners";

/**
 * The picture half of the sign-in and register pages.
 *
 * CMS-driven: an editor publishes a Banner with position `auth` (an offer, a
 * new collection, a product shot) and it appears here, linked if the banner
 * has a link. Swapping the artwork is a CMS edit, never a deploy.
 *
 * With nothing published it falls back to a quiet panel listing what an
 * account is for. The fallback says nothing about prices, offers or delivery
 * promises: those belong to the shop owner and change, so they only ever come
 * from the CMS.
 */
export async function AuthShowcase() {
  const banner = await getLiveBanner("auth");
  if (!banner) return <AuthShowcaseFallback />;

  const art = (
    <>
      <Image
        src={banner.image}
        alt={banner.title ?? ""}
        fill
        // Half the viewport on desktop. On a phone it sits below the form,
        // so it is never the LCP there and does not need to load eagerly.
        sizes="(min-width: 1024px) 50vw, 100vw"
        className="object-cover object-center transition-transform duration-700 group-hover:scale-[1.02]"
      />
      {(banner.title || banner.link) && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgba(12,12,14,0.72) 0%, rgba(12,12,14,0.25) 35%, rgba(12,12,14,0) 60%)",
          }}
        />
      )}
      {(banner.title || banner.link) && (
        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
          {banner.title && (
            <p className="text-h2 font-heading text-white">{banner.title}</p>
          )}
          {banner.link && (
            <span className="mt-3 inline-block border-b border-white/80 pb-0.5 text-sm text-white">
              Shop now →
            </span>
          )}
        </div>
      )}
    </>
  );

  const frame =
    "group relative block aspect-[4/3] w-full overflow-hidden bg-muted lg:aspect-auto lg:h-full lg:min-h-[560px]";

  return banner.link ? (
    <Link href={banner.link} className={frame} aria-label={banner.title ?? "See the offer"}>
      {art}
    </Link>
  ) : (
    <div className={frame}>{art}</div>
  );
}

function AuthShowcaseFallback() {
  const perks = [
    ["Track every order", "From packing to your doorstep, in one place."],
    ["Your wishlist, saved", "Keep the pieces you love and come back to them."],
    ["Faster checkout", "Saved addresses mean fewer steps next time."],
  ] as const;

  return (
    <div className="flex h-full w-full flex-col justify-center bg-muted px-6 py-10 sm:px-10 lg:min-h-[560px]">
      <p className="label-eyebrow mb-3">MY Silvers</p>
      <p className="text-h2 font-heading">Hallmarked 925 sterling silver, made to be worn every day.</p>
      <ul className="mt-8 space-y-5">
        {perks.map(([title, body]) => (
          <li key={title} className="border-t pt-5">
            <p className="text-sm font-medium">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Same footprint as the panel, so the form does not jump when it streams in. */
export function AuthShowcaseSkeleton() {
  return <div className="aspect-[4/3] w-full animate-pulse bg-muted lg:aspect-auto lg:h-full lg:min-h-[560px]" />;
}
