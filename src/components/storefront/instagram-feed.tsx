import Image from "next/image";
import { getInstagramFeed } from "@/server/integrations/instagram";
import { RevealSection } from "@/components/storefront/reveal-section";

// Inline glyph — lucide-react v1 dropped brand icons.
function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect width="20" height="20" x="2" y="2" rx="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

/** Heading and eyebrow come from the CMS homepage section that renders this. */
export async function InstagramFeed({
  title,
  eyebrow,
}: {
  title?: string;
  eyebrow?: string;
} = {}) {
  const posts = await getInstagramFeed(8);
  if (posts.length === 0) return null;

  return (
    <RevealSection className="container-page rhythm-commerce">
      {eyebrow && <p className="label-eyebrow mb-2 text-center">{eyebrow}</p>}
      <div className="mb-6 flex items-center justify-center gap-2">
        <InstagramGlyph className="h-5 w-5" />
        {title && <h2 className="text-h2">{title}</h2>}
      </div>
      <div className="grid grid-cols-2 gap-px sm:grid-cols-4 sm:gap-0">
        {posts.map((post) => (
          <a
            key={post.id}
            href={post.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative aspect-square overflow-hidden bg-muted"
          >
            <Image
              src={post.imageUrl}
              alt={post.caption?.slice(0, 100) ?? "Instagram post"}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 50vw, 25vw"
            />
          </a>
        ))}
      </div>
    </RevealSection>
  );
}
