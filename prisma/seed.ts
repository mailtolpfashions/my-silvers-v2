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
      { name: "announcementText", label: "Announcement bar text", type: "text" },
      { name: "heroTitle", label: "Hero title", type: "text", required: true },
      { name: "heroSubtitle", label: "Hero subtitle", type: "textarea" },
      { name: "heroCta", label: "Hero CTA label", type: "text" },
      { name: "heroLink", label: "Hero CTA link", type: "text" },
      { name: "heroImage", label: "Hero image", type: "image" },
      { name: "heroVideo", label: "Hero video", type: "text" },
      { name: "heroBackground", label: "Hero background color", type: "color" },
      {
        name: "trustItems",
        label: "Trust bar items",
        type: "array",
        of: [
          { name: "icon", label: "Icon", type: "text" },
          { name: "text", label: "Text", type: "text" },
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
      { name: "tags", label: "Tags", type: "array", of: [{ name: "tag", label: "Tag", type: "text" }] },
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
      {
        name: "theme",
        label: "Theme",
        type: "select",
        options: ["bridal", "daily-wear", "office-wear", "festive", "custom"],
      },
      { name: "description", label: "Description", type: "textarea" },
      { name: "story", label: "Story", type: "richtext" },
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
        label: "Position",
        type: "select",
        options: ["homepage-hero", "homepage-mid", "category", "sidebar"],
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

async function main() {
  await seedContentTypes();
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
