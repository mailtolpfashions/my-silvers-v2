import "dotenv/config";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ─── System content types ──────────────────────────────────────────────────

const systemContentTypes = [
  {
    name: "homepage",
    label: "Homepage",
    icon: "home",
    isSingleton: true,
    fields: [

      // ── Hero ─────────────────────────────────────────────────────────────
      // Slides live here rather than in a separate content type. There used to
      // be both: a `heroSlide` type AND a set of hero* fields on this entry,
      // with slides silently winning — so an editor had two plausible places to
      // change the hero and no way to tell which one the site used.
      //
      // Order in this array is the order on screen; the old `sortOrder` field
      // is gone because the array's own up/down controls replace it.
      {
        name: "slides",
        label: "Hero slides — order here is the order they rotate in",
        type: "array",
        of: [
          { name: "eyebrow", label: "Eyebrow", type: "text" },
          {
            name: "headline",
            label: "Headline (use a line break for two lines)",
            type: "textarea",
            required: true,
          },
          { name: "subline", label: "Subline", type: "textarea" },
          { name: "ctaLabel", label: "Button label", type: "text" },
          { name: "ctaHref", label: "Button link", type: "text" },
          { name: "secondaryLabel", label: "Secondary link label", type: "text" },
          { name: "secondaryHref", label: "Secondary link href", type: "text" },
          { name: "media", label: "Background image or video", type: "media" },
          { name: "overlayOpacity", label: "Overlay opacity (0–100)", type: "number" },
          { name: "isActive", label: "Show this slide", type: "boolean" },
        ],
      },
      {
        name: "trustItems",
        label: "Trust bar items",
        type: "array",
        of: [
          {
            name: "icon",
            label:
              "Icon — shield-check, truck, refresh-ccw, sparkles, gem, gift, award, star, lock, leaf, package, wallet, heart, badge-check, rotate-ccw (or an emoji)",
            type: "text",
          },
          { name: "text", label: "Text", type: "text" },
        ],
      },
      {
        name: "sections",
        label: "Homepage sections — order here is the order on the page",
        type: "array",
        of: [
          {
            name: "type",
            label: "Section type",
            type: "select",
            options: [
              "products",
              "collections",
              "banner",
              "instagram",
              "editorial",
              "categoryTiles",
              "usp",
            ],
            required: true,
          },
          { name: "title", label: "Heading", type: "text" },
          { name: "eyebrow", label: "Eyebrow", type: "text" },
          {
            name: "source",
            label: "Which products",
            type: "select",
            options: ["newest", "bestseller", "featured", "category"],
            showWhen: { field: "type", equals: ["products"] },
          },
          {
            name: "categorySlug",
            label: "Category slug (when source is 'category')",
            type: "text",
            showWhen: { field: "type", equals: ["products"] },
          },
          {
            name: "featuredOnly",
            label: "Featured collections only",
            type: "boolean",
            showWhen: { field: "type", equals: ["collections"] },
          },
          {
            name: "bannerPosition",
            label: "Which banner position to show",
            type: "select",
            options: ["homepage-hero", "homepage-mid", "category"],
            showWhen: { field: "type", equals: ["banner"] },
          },
          {
            name: "limit",
            label: "How many items",
            type: "number",
            showWhen: { field: "type", equals: ["products", "collections", "categoryTiles"] },
          },
          {
            name: "viewAllHref",
            label: "'View all' link (blank to hide)",
            type: "text",
            showWhen: { field: "type", equals: ["products", "collections"] },
          },
          { name: "isActive", label: "Show this section", type: "boolean" },

          // ── Editorial ──
          {
            name: "body",
            label: "Body copy",
            type: "textarea",
            showWhen: { field: "type", equals: ["editorial"] },
          },
          {
            name: "image",
            label: "Image",
            type: "image",
            showWhen: { field: "type", equals: ["editorial"] },
          },
          {
            name: "ctaLabel",
            label: "Button label",
            type: "text",
            showWhen: { field: "type", equals: ["editorial"] },
          },
          {
            name: "ctaHref",
            label: "Button link",
            type: "text",
            showWhen: { field: "type", equals: ["editorial"] },
          },
          {
            name: "imageSide",
            label: "Image side (alternate these down the page)",
            type: "select",
            options: ["left", "right"],
            showWhen: { field: "type", equals: ["editorial"] },
          },

          // ── USP / craft story ──
          {
            name: "items",
            label: "The claims to show",
            type: "array",
            showWhen: { field: "type", equals: ["usp"] },
            of: [
              {
                name: "icon",
                label: "Icon — a Lucide name (shield-check, gem, award…) or an emoji",
                type: "text",
              },
              { name: "title", label: "Title", type: "text" },
              { name: "text", label: "Text", type: "text" },
            ],
          },
        ],
      },
      {
        name: "testimonials",
        label: "Testimonials",
        type: "array",
        of: [
          { name: "name", label: "Name", type: "text" },
          { name: "quote", label: "Quote", type: "textarea" },
          { name: "rating", label: "Rating", type: "number" },
        ],
      },
    ],
  },
  {
    name: "page",
    label: "Pages",
    icon: "file-text",
    isSingleton: false,
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "slug", label: "Slug", type: "slug", required: true },
      { name: "excerpt", label: "Excerpt", type: "textarea" },
      { name: "content", label: "Content", type: "richtext" },
      { name: "coverImage", label: "Cover image", type: "image" },
    ],
  },
  {
    name: "blog",
    label: "Blog",
    icon: "newspaper",
    isSingleton: false,
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "slug", label: "Slug", type: "slug", required: true },
      { name: "author", label: "Author", type: "text" },
      { name: "excerpt", label: "Excerpt", type: "textarea" },
      { name: "body", label: "Body", type: "richtext", required: true },
      { name: "coverImage", label: "Cover image", type: "image" },
      { name: "publishedAt", label: "Published at", type: "date" },
    ],
  },
  {
    name: "collection",
    label: "Collections",
    icon: "sparkles",
    isSingleton: false,
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "slug", label: "Slug", type: "slug", required: true },
      { name: "eyebrow", label: "Eyebrow", type: "text" },
      { name: "description", label: "Description", type: "textarea" },
      { name: "story", label: "Story", type: "richtext" },
      {
        name: "productTag",
        // Membership rides on Product.tags — set the same tag on the products
        // in /admin and they appear on the collection page automatically.
        label: "Product tag — products with this tag appear in this collection",
        type: "text",
      },
      { name: "heroImage", label: "Hero image", type: "image" },
      { name: "thumbnailImage", label: "Thumbnail image", type: "image" },
      { name: "cta", label: "CTA label", type: "text" },
      { name: "isFeatured", label: "Featured", type: "boolean" },
      { name: "sortOrder", label: "Sort order", type: "number" },
    ],
  },
  {
    name: "announcement",
    label: "Announcements",
    icon: "megaphone",
    isSingleton: false,
    fields: [
      { name: "text", label: "Text", type: "text", required: true },
      { name: "subtext", label: "Subtext", type: "text" },
      { name: "cta", label: "CTA label", type: "text" },
      { name: "tone", label: "Tone", type: "select", options: ["neutral", "sale", "info", "alert"] },
      { name: "isActive", label: "Active", type: "boolean" },
      { name: "startsAt", label: "Starts at", type: "date" },
      { name: "endsAt", label: "Ends at", type: "date" },
    ],
  },
  {
    name: "banner",
    label: "Banners",
    icon: "image",
    isSingleton: false,
    fields: [
      { name: "title", label: "Title", type: "text" },
      { name: "image", label: "Image", type: "image", required: true },
      { name: "link", label: "Link", type: "text" },
      {
        name: "position",
        label: "Position — where this banner appears",
        type: "select",
        options: ["homepage-hero", "homepage-mid", "category"],
      },
      {
        name: "categorySlug",
        // A select can't express per-category targeting, and a position option
        // no editor could pick would be another dead control. This is the
        // reachable version.
        label: "Category position only: which category (blank = all of them)",
        type: "text",
      },
      { name: "isActive", label: "Active", type: "boolean" },
      { name: "startsAt", label: "Starts at", type: "date" },
      { name: "endsAt", label: "Ends at", type: "date" },
    ],
  },
];

async function seedContentTypes() {
  for (const ct of systemContentTypes) {
    await prisma.contentType.upsert({
      where: { name: ct.name },
      update: { label: ct.label, icon: ct.icon, isSingleton: ct.isSingleton, fields: ct.fields },
      create: { ...ct, isSystem: true },
    });
  }
  console.log(`Seeded ${systemContentTypes.length} system content types.`);
}

// ─── Admin user ─────────────────────────────────────────────────────────────

async function seedAdminUser() {
  const email = "admin@mysilvers.in";
  const password = crypto.randomBytes(18).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin user ${email} already exists — leaving password unchanged.`);
    return;
  }

  await prisma.user.create({
    data: { email, name: "Admin", passwordHash, role: "admin" },
  });

  console.log("\n✅ Admin user created:");
  console.log(`   Email:    ${email}`);
  console.log(`   Password: ${password}`);
  console.log("   (save this now — it will not be shown again)\n");
}

// ─── Sample catalog ─────────────────────────────────────────────────────────

async function seedCatalog() {
  const category = await prisma.category.upsert({
    where: { slug: "rings" },
    update: {},
    create: {
      name: "Rings",
      slug: "rings",
      description: "Sterling silver rings for everyday wear and special occasions.",
      sortOrder: 1,
    },
  });

  await prisma.product.upsert({
    where: { sku: "MYS-RING-001" },
    update: {},
    create: {
      name: "Classic Band Ring",
      slug: "classic-band-ring",
      description:
        "A timeless 925 sterling silver band ring, hand-finished with a high polish shine.",
      shortDescription: "Timeless sterling silver band ring.",
      price: 1499,
      compareAtPrice: 1899,
      images: [],
      categoryId: category.id,
      weight: 3.2,
      sizes: ["6", "7", "8", "9"],
      material: "925 Sterling Silver",
      stock: 25,
      sku: "MYS-RING-001",
      isFeatured: true,
      tags: ["rings", "bestseller", "everyday"],
    },
  });

  console.log("Seeded sample category + product.");
}

// ─── Default homepage entry ────────────────────────────────────────────────

/**
 * Gives a fresh database a working, EDITABLE homepage. These values live in the
 * CMS entry rather than in code so an editor can change them on day one — the
 * storefront components hold no copy of their own.
 *
 * Only created when absent: never overwrites a homepage someone has edited.
 */
async function seedDefaultHomepage() {
  const contentType = await prisma.contentType.findUnique({ where: { name: "homepage" } });
  if (!contentType) return;

  const existing = await prisma.contentEntry.findFirst({
    where: { contentTypeId: contentType.id },
    select: { id: true },
  });
  if (existing) {
    console.log("Homepage entry already exists — leaving its content unchanged.");
    return;
  }

  const data = {
    heroTitle: "Jewellery, crafted for everyday wear.",
    heroSubtitle:
      "Timeless 925 sterling silver pieces, designed to be worn every day — not just on special occasions.",
    heroCta: "Shop the collection",
    heroLink: "/products",
    sections: [
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
    ],
  };

  await prisma.contentEntry.create({
    data: {
      contentTypeId: contentType.id,
      slug: "homepage",
      status: "published",
      data,
      publishedData: data,
      publishedAt: new Date(),
    },
  });

  console.log("Created a default published homepage entry (editable in the CMS).");
}

async function main() {
  await seedContentTypes();
  await seedDefaultHomepage();
  await seedAdminUser();
  await seedCatalog();
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
