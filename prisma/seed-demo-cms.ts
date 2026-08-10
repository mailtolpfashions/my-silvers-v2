/**
 * DEV-ONLY demo CMS content — homepage, announcements, blog posts, pages,
 * collections and banners, so the CMS and the storefront sections it drives
 * have something real to render.
 *
 * Never run this against production.
 *
 *   npm run db:seed:demo:cms
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";

const DEV_PROJECT_REF = "skyifgumokdwcgwjupvr";

const url = process.env.DATABASE_URL ?? "";
if (!url.includes(DEV_PROJECT_REF) && !url.includes("localhost")) {
  console.error(
    "\n✋ Refusing to run the demo CMS seed — DATABASE_URL is not the dev project.\n"
  );
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// placehold.co needs the .png extension — next/image rejects SVG.
const img = (label: string, bg = "F7F5F3", size = "1200x800", fg = "0C0C0E") =>
  `https://placehold.co/${size}/${bg}/${fg}.png?text=${encodeURIComponent(label)}`;

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

type EntrySpec = {
  type: string;
  slug: string;
  data: Prisma.InputJsonObject;
  publishedAt?: Date;
  seoMetaTitle?: string;
  seoMetaDescription?: string;
  status?: "draft" | "published";
};

// ─── Homepage (singleton) ───────────────────────────────────────────────────

const homepage: EntrySpec = {
  type: "homepage",
  slug: "homepage",
  publishedAt: daysAgo(30),
  seoMetaTitle: "MY Silvers — 925 Sterling Silver Jewellery",
  seoMetaDescription:
    "BIS hallmarked 925 sterling silver jewellery, crafted for everyday wear. Free shipping above ₹999.",
  data: {
    announcementText: "Free shipping on orders above ₹999",
    heroTitle: "Silver that lives with you.",
    heroSubtitle:
      "BIS hallmarked 925 sterling silver — rings, earrings and everyday pieces made to be worn, not saved for occasions.",
    heroCta: "Shop the collection",
    heroLink: "/products",
    heroImage: img("Hero — Sterling Silver", "F5ECD9", "1200x900"),
    heroBackground: "#FFFDF8",
    sections: [
      {
        type: "collections",
        title: "Shop by collection",
        eyebrow: "Curated for you",
        featuredOnly: true,
        limit: 3,
        viewAllHref: "/collections",
        isActive: true,
      },
      {
        type: "products",
        title: "New arrivals",
        eyebrow: "Just landed",
        source: "newest",
        limit: 8,
        viewAllHref: "/products?sort=newest",
        isActive: true,
      },
      {
        type: "products",
        title: "Bestsellers",
        eyebrow: "Most loved",
        source: "bestseller",
        limit: 8,
        viewAllHref: "/products",
        isActive: true,
      },
      {
        type: "banner",
        bannerPosition: "homepage-mid",
        isActive: true,
      },
      {
        type: "products",
        title: "Rings for every day",
        eyebrow: "Category",
        source: "category",
        categorySlug: "rings",
        limit: 4,
        viewAllHref: "/category/rings",
        isActive: true,
      },
      {
        type: "products",
        title: "Featured",
        eyebrow: "Our picks",
        source: "featured",
        limit: 8,
        viewAllHref: "/products?sort=featured",
        isActive: true,
      },
      {
        type: "instagram",
        title: "Follow us on Instagram",
        eyebrow: "@mysilvers",
        isActive: true,
      },
      // The four trust claims, in their new home.
      //
      // These used to be `trustItems` — a strip of four icons wedged directly
      // under the hero, competing with the first photograph on the page. The
      // field is gone; the claims are not. As a `usp` section they are still
      // fully editable, and they now land where a shopper reads them: after
      // they have seen the jewellery the claims are about.
      {
        type: "usp",
        title: "Why 925",
        eyebrow: "The craft",
        items: [
          { icon: "shield-check", text: "BIS Hallmarked 925 Silver" },
          { icon: "truck", text: "Free shipping above ₹999" },
          { icon: "refresh-ccw", text: "15-day easy returns" },
          { icon: "sparkles", text: "Anti-tarnish finish" },
        ],
        isActive: true,
      },
    ],
    testimonials: [
      {
        name: "Divya R., Chennai",
        quote:
          "Wore the twisted band every single day for four months — no tarnish, no green finger. Exactly what I wanted.",
        rating: 5,
      },
      {
        name: "Aarthi S., Coimbatore",
        quote:
          "Ordered the jhumkas for my sister's wedding. The finish is far better than the price suggests.",
        rating: 5,
      },
      {
        name: "Meera K., Bengaluru",
        quote:
          "Packaging was lovely and it arrived in three days. The anklet is delicate but doesn't feel flimsy.",
        rating: 4,
      },
    ],
  },
};

// ─── Hero slides ────────────────────────────────────────────────────────────

const heroSlides: EntrySpec[] = [
  {
    type: "heroSlide",
    slug: "hero-everyday",
    publishedAt: daysAgo(30),
    data: {
      eyebrow: "925 Sterling Silver",
      headline: "Silver that\nlives with you.",
      subline:
        "BIS hallmarked sterling silver — rings, earrings and everyday pieces made to be worn, not saved for occasions.",
      ctaLabel: "Shop the collection",
      ctaHref: "/products",
      secondaryLabel: "View all",
      secondaryHref: "/products",
      media: img("Everyday Silver", "C9A96E", "1920x1080", "FFFDF8"),
      overlayOpacity: 60,
      isActive: true,
      sortOrder: 1,
    },
  },
  {
    type: "heroSlide",
    slug: "hero-bridal",
    publishedAt: daysAgo(25),
    data: {
      eyebrow: "Wedding season",
      headline: "The Bridal Edit\nis here.",
      subline:
        "Jhumkas, layered chains and temple-work cuffs — traditional silhouettes, light enough to wear all day.",
      ctaLabel: "Shop bridal",
      ctaHref: "/products?q=jhumka",
      secondaryLabel: "See the story",
      secondaryHref: "/products",
      media: img("The Bridal Edit", "8A6D33", "1920x1080", "FFFDF8"),
      overlayOpacity: 55,
      isActive: true,
      sortOrder: 2,
    },
  },
  {
    type: "heroSlide",
    slug: "hero-oxidised",
    publishedAt: daysAgo(6),
    data: {
      eyebrow: "New in",
      headline: "Oxidised,\nreimagined.",
      subline:
        "Darkened recesses throw the pattern forward. Traditional technique, contemporary scale.",
      ctaLabel: "Shop oxidised",
      ctaHref: "/products?q=oxidised",
      media: img("Oxidised Collection", "2D2D2D", "1920x1080", "FFFDF8"),
      overlayOpacity: 50,
      isActive: true,
      sortOrder: 3,
    },
  },
];

// ─── Announcements ──────────────────────────────────────────────────────────

const announcements: EntrySpec[] = [
  {
    type: "announcement",
    slug: "free-shipping-999",
    publishedAt: daysAgo(20),
    data: {
      text: "Free shipping on all orders above ₹999",
      subtext: "Delivered in 3–5 working days",
      tone: "neutral",
      isActive: true,
    },
  },
  {
    type: "announcement",
    slug: "festive-sale",
    publishedAt: daysAgo(5),
    data: {
      text: "Festive Edit — up to 25% off",
      subtext: "Ends this Sunday",
      cta: "Shop the sale",
      tone: "sale",
      isActive: false,
      startsAt: daysAgo(5).toISOString(),
      endsAt: daysAgo(-9).toISOString(),
    },
  },
  {
    type: "announcement",
    slug: "new-arrivals-oxidised",
    publishedAt: daysAgo(2),
    data: {
      text: "New in: the Oxidised collection",
      tone: "info",
      isActive: false,
    },
  },
];

// ─── Blog ───────────────────────────────────────────────────────────────────

const blogPosts: EntrySpec[] = [
  {
    type: "blog",
    slug: "how-to-stop-silver-tarnishing",
    publishedAt: daysAgo(3),
    seoMetaTitle: "How to Stop Your Silver Jewellery Tarnishing",
    seoMetaDescription:
      "Why sterling silver darkens, and six habits that keep your pieces bright for years.",
    data: {
      title: "How to stop your silver tarnishing",
      slug: "how-to-stop-silver-tarnishing",
      author: "MY Silvers",
      excerpt:
        "Tarnish isn't damage — it's chemistry, and it's reversible. Here's what actually causes it and how to slow it down.",
      coverImage: img("Caring for Silver", "F5ECD9"),
      publishedAt: daysAgo(3).toISOString(),
      tags: [{ tag: "care" }, { tag: "guides" }],
      body: `<p>Sterling silver is 92.5% silver and 7.5% copper. That copper is what makes the metal strong enough to wear daily — and it's also what reacts with sulphur in the air to form the dark layer we call tarnish.</p>
<h2>What speeds it up</h2>
<ul><li><strong>Humidity</strong> — coastal air is the worst offender</li><li><strong>Perfume and hairspray</strong> — put jewellery on last</li><li><strong>Chlorine</strong> — take rings off before a pool</li><li><strong>Rubber bands and cardboard</strong> — both release sulphur</li></ul>
<h2>What actually helps</h2>
<p>Store pieces in the anti-tarnish pouch they arrived in, with the air pushed out. A sealed pouch does more than any polish.</p>
<p>Wear them. Skin oils slow oxidation, which is why the ring you never take off stays brighter than the one in the box.</p>
<blockquote>If tarnish has already formed, a soft polishing cloth restores the finish in under a minute. Never use toothpaste — it's abrasive and leaves micro-scratches.</blockquote>`,
    },
  },
  {
    type: "blog",
    slug: "925-hallmark-meaning",
    publishedAt: daysAgo(12),
    seoMetaTitle: "What the 925 Hallmark Actually Means",
    data: {
      title: "What the 925 hallmark actually means",
      slug: "925-hallmark-meaning",
      author: "MY Silvers",
      excerpt:
        "Not all silver is sterling, and not all sterling is hallmarked. How to read the stamp on your jewellery.",
      coverImage: img("The 925 Hallmark", "F5E6E0"),
      publishedAt: daysAgo(12).toISOString(),
      tags: [{ tag: "guides" }, { tag: "buying" }],
      body: `<p>The number <strong>925</strong> means 92.5% pure silver by weight. Pure silver is too soft for jewellery — it bends out of shape — so the remaining 7.5% is usually copper.</p>
<h2>BIS hallmarking in India</h2>
<p>A BIS hallmark is an independent assay office certifying that purity. It's not a brand mark, and it isn't optional marketing — it's a test result.</p>
<p>Look for the BIS logo, the purity number, and the assaying centre's mark. If a piece is described as "silver" with no number at all, ask what alloy it is.</p>`,
    },
  },
  {
    type: "blog",
    slug: "finding-your-ring-size",
    publishedAt: daysAgo(21),
    data: {
      title: "Finding your ring size at home",
      slug: "finding-your-ring-size",
      author: "MY Silvers",
      excerpt: "A piece of thread, a ruler, and two minutes — no jeweller required.",
      coverImage: img("Ring Sizing", "F7F5F3"),
      publishedAt: daysAgo(21).toISOString(),
      tags: [{ tag: "guides" }, { tag: "rings" }],
      body: `<p>Wrap a thin strip of paper around the base of your finger, mark where it overlaps, and measure that length in millimetres. That's your circumference.</p>
<h2>Two things people get wrong</h2>
<ol><li><strong>Measuring cold.</strong> Fingers shrink. Measure at the end of the day, when your hands are warm.</li><li><strong>Forgetting the knuckle.</strong> The ring has to pass over it — if your knuckle is much wider, size up.</li></ol>
<p>Between sizes? Go up. A slightly loose ring can be resized down far more easily than a tight one can be stretched.</p>`,
    },
  },
  {
    type: "blog",
    slug: "oxidised-silver-explained",
    publishedAt: daysAgo(34),
    data: {
      title: "Oxidised silver, explained",
      slug: "oxidised-silver-explained",
      author: "MY Silvers",
      excerpt: "The dark finish on temple jewellery isn't damage — it's deliberate.",
      coverImage: img("Oxidised Finish", "F5ECD9"),
      publishedAt: daysAgo(34).toISOString(),
      tags: [{ tag: "craft" }],
      body: `<p>Oxidising is controlled tarnish. The piece is treated so the recesses darken while the raised surfaces stay bright, throwing the design into relief.</p>
<p>It's why traditional South Indian temple work reads so clearly from a distance — the contrast does the work.</p>
<h2>Caring for it</h2>
<p>Don't polish oxidised pieces the way you would a plain band. Aggressive polishing strips the darkened layer out of the recesses and flattens the design. Wipe with a dry, soft cloth only.</p>`,
    },
  },
  {
    type: "blog",
    slug: "everyday-stack-guide",
    publishedAt: daysAgo(48),
    data: {
      title: "Building an everyday stack",
      slug: "everyday-stack-guide",
      author: "MY Silvers",
      excerpt: "Three rings, one rule: vary the width.",
      coverImage: img("Everyday Stack", "F5E6E0"),
      publishedAt: daysAgo(48).toISOString(),
      tags: [{ tag: "styling" }, { tag: "rings" }],
      body: `<p>The mistake with stacking is choosing three rings of the same width. They read as one thick band and the effect is lost.</p>
<p>Pick one wider anchor ring, then two thinner pieces — a plain band and something textured. Keep them all the same metal so the stack looks intentional.</p>`,
    },
  },
  {
    type: "blog",
    slug: "gifting-guide-silver",
    status: "draft",
    data: {
      title: "A gifting guide for people who hate guessing",
      slug: "gifting-guide-silver",
      author: "MY Silvers",
      excerpt: "Draft — sizes, safe bets and what to avoid.",
      coverImage: img("Gifting Guide", "F7F5F3"),
      tags: [{ tag: "gifting" }],
      body: `<p>Draft post. Pendants and anklets are the safe choices — no sizing required.</p>`,
    },
  },
];

// ─── Pages ──────────────────────────────────────────────────────────────────

const pages: EntrySpec[] = [
  {
    type: "page",
    slug: "about",
    publishedAt: daysAgo(60),
    seoMetaTitle: "About MY Silvers",
    data: {
      title: "About MY Silvers",
      slug: "about",
      excerpt: "A small silver studio making pieces meant for daily wear.",
      coverImage: img("Our Studio", "F5ECD9"),
      content: `<p>MY Silvers began with a simple frustration: most silver jewellery is either too fragile to wear daily or too heavy to enjoy.</p>
<p>Every piece we make is 925 sterling, BIS hallmarked, and finished by hand. We keep the range deliberately small so we can hold the quality.</p>
<h2>Where we are</h2>
<p>We work out of a small studio in Tamil Nadu and ship across India.</p>`,
    },
  },
  {
    type: "page",
    slug: "shipping",
    publishedAt: daysAgo(60),
    data: {
      title: "Shipping & Delivery",
      slug: "shipping",
      excerpt: "Timelines, charges and tracking.",
      content: `<h2>Charges</h2>
<p>Free shipping on all orders above ₹999. Below that, a flat ₹79 applies.</p>
<h2>Timelines</h2>
<ul><li>Metros — 2 to 4 working days</li><li>Rest of India — 4 to 7 working days</li></ul>
<p>You'll get a tracking link by email as soon as the parcel is picked up.</p>`,
    },
  },
  {
    type: "page",
    slug: "returns",
    publishedAt: daysAgo(60),
    data: {
      title: "Returns & Exchanges",
      slug: "returns",
      excerpt: "15 days, no questions asked.",
      content: `<p>If a piece isn't right, return it within <strong>15 days</strong> of delivery for a full refund or exchange.</p>
<h2>Conditions</h2>
<ul><li>Unworn, with the original pouch and packaging</li><li>Custom and engraved pieces can't be returned</li><li>Refunds reach your account within 5–7 working days of us receiving the parcel</li></ul>
<p>Email <a href="mailto:orders@mysilvers.in">orders@mysilvers.in</a> to start a return.</p>`,
    },
  },
  {
    type: "page",
    slug: "care-guide",
    publishedAt: daysAgo(45),
    data: {
      title: "Silver Care Guide",
      slug: "care-guide",
      excerpt: "Keep your pieces bright for years.",
      coverImage: img("Care Guide", "F7F5F3"),
      content: `<h2>Daily</h2>
<p>Put jewellery on last, after perfume and hairspray. Take rings off before washing up.</p>
<h2>Storage</h2>
<p>Sealed pouch, air pushed out, away from humidity. Don't store silver with rubber bands or in cardboard.</p>
<h2>Cleaning</h2>
<p>A soft polishing cloth is all a plain piece needs. Never use toothpaste or abrasive powders.</p>`,
    },
  },
];

// ─── Collections ────────────────────────────────────────────────────────────

const collections: EntrySpec[] = [
  {
    type: "collection",
    slug: "bridal",
    publishedAt: daysAgo(25),
    data: {
      title: "The Bridal Edit",
      slug: "bridal",
      eyebrow: "Wedding season",
      theme: "bridal",
      description: "Statement pieces for the days that get photographed.",
      story: `<p>Built around traditional South Indian silhouettes — jhumkas, layered chains and temple-work cuffs — reworked light enough to wear through a full day of ceremonies.</p>`,
      heroImage: img("The Bridal Edit", "F5E6E0", "1600x900"),
      thumbnailImage: img("Bridal", "F5E6E0", "800x800"),
      cta: "Shop bridal",
      isFeatured: true,
      sortOrder: 1,
    },
  },
  {
    type: "collection",
    slug: "everyday",
    publishedAt: daysAgo(25),
    data: {
      title: "Everyday Silver",
      slug: "everyday",
      eyebrow: "Wear it daily",
      theme: "daily-wear",
      description: "Pieces that survive commutes, dishes and sleep.",
      story: `<p>Simple bands, huggie hoops and slim chains — nothing that catches on a jumper.</p>`,
      heroImage: img("Everyday Silver", "F7F5F3", "1600x900"),
      thumbnailImage: img("Everyday", "F7F5F3", "800x800"),
      cta: "Shop everyday",
      isFeatured: true,
      sortOrder: 2,
    },
  },
  {
    type: "collection",
    slug: "office",
    publishedAt: daysAgo(18),
    data: {
      title: "Quiet at Work",
      slug: "office",
      eyebrow: "Nine to five",
      theme: "office-wear",
      description: "Understated pieces that don't compete with a meeting.",
      story: `<p>Matte finishes and small profiles. Nothing that jangles on a keyboard.</p>`,
      heroImage: img("Quiet at Work", "F5ECD9", "1600x900"),
      thumbnailImage: img("Office", "F5ECD9", "800x800"),
      cta: "Shop office wear",
      isFeatured: false,
      sortOrder: 3,
    },
  },
  {
    type: "collection",
    slug: "oxidised",
    publishedAt: daysAgo(6),
    data: {
      title: "Oxidised",
      slug: "oxidised",
      eyebrow: "New in",
      theme: "festive",
      description: "Temple-work contrast, in a lighter weight.",
      story: `<p>The darkened recesses throw the pattern forward. Traditional technique, contemporary scale.</p>`,
      heroImage: img("Oxidised", "FFFDF8", "1600x900"),
      thumbnailImage: img("Oxidised", "FFFDF8", "800x800"),
      cta: "Shop oxidised",
      isFeatured: true,
      sortOrder: 4,
    },
  },
];

// ─── Banners ────────────────────────────────────────────────────────────────

const banners: EntrySpec[] = [
  {
    type: "banner",
    slug: "hero-festive",
    publishedAt: daysAgo(5),
    data: {
      title: "Festive Edit — up to 25% off",
      image: img("Festive Edit — 25% off", "F5E6E0", "1600x600"),
      link: "/products?sort=featured",
      position: "homepage-hero",
      isActive: true,
    },
  },
  {
    type: "banner",
    slug: "mid-new-arrivals",
    publishedAt: daysAgo(2),
    data: {
      title: "New in: Oxidised",
      image: img("New In — Oxidised", "F5ECD9", "1600x600"),
      link: "/products?q=oxidised",
      position: "homepage-mid",
      isActive: true,
    },
  },
  {
    type: "banner",
    slug: "category-rings",
    publishedAt: daysAgo(14),
    data: {
      title: "Rings for every day",
      image: img("Rings", "F7F5F3", "1600x600"),
      link: "/category/rings",
      position: "category",
      isActive: false,
    },
  },
];

// ─── Write ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding demo CMS content…\n");

  const types = await prisma.contentType.findMany({ select: { id: true, name: true } });
  const typeIdByName = new Map(types.map((t) => [t.name, t.id]));

  if (typeIdByName.size === 0) {
    console.error("No content types found — run `npm run db:seed` first.\n");
    process.exit(1);
  }

  // Attribute authorship to an admin so the CMS shows a real author.
  const admin = await prisma.user.findFirst({
    where: { role: "admin" },
    select: { id: true },
  });

  const all: EntrySpec[] = [
    homepage,
    ...heroSlides,
    ...announcements,
    ...blogPosts,
    ...pages,
    ...collections,
    ...banners,
  ];
  const counts = new Map<string, number>();

  for (const spec of all) {
    const contentTypeId = typeIdByName.get(spec.type);
    if (!contentTypeId) {
      console.warn(`  skipped ${spec.type}/${spec.slug} — content type not found`);
      continue;
    }

    const status = spec.status ?? "published";
    const isPublished = status === "published";

    await prisma.contentEntry.upsert({
      where: { contentTypeId_slug: { contentTypeId, slug: spec.slug } },
      update: {
        data: spec.data,
        publishedData: isPublished ? spec.data : Prisma.JsonNull,
        status,
        publishedAt: isPublished ? (spec.publishedAt ?? new Date()) : null,
        seoMetaTitle: spec.seoMetaTitle,
        seoMetaDescription: spec.seoMetaDescription,
        updatedById: admin?.id,
      },
      create: {
        contentTypeId,
        slug: spec.slug,
        status,
        data: spec.data,
        publishedData: isPublished ? spec.data : Prisma.JsonNull,
        publishedAt: isPublished ? (spec.publishedAt ?? new Date()) : null,
        seoMetaTitle: spec.seoMetaTitle,
        seoMetaDescription: spec.seoMetaDescription,
        createdById: admin?.id,
        updatedById: admin?.id,
        publishedById: isPublished ? admin?.id : null,
      },
    });

    counts.set(spec.type, (counts.get(spec.type) ?? 0) + 1);
  }

  for (const [type, n] of [...counts].sort()) {
    console.log(`  ${type.padEnd(13)} ${n}`);
  }

  const published = await prisma.contentEntry.count({ where: { status: "published" } });
  const drafts = await prisma.contentEntry.count({ where: { status: "draft" } });
  console.log(`\n✅ ${published} published, ${drafts} draft entries.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
