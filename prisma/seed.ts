import "dotenv/config";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { systemContentTypes } from "./content-types";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });


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
      // Header nav icon, editable in /admin/categories. Resolved through
      // CmsIcon, which falls back to rendering the value as text.
      icon: "circle",
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
      // Sums to the 25 below — Product.stock is the maintained total.
      variants: {
        create: [
          { size: "6", stock: 7 },
          { size: "7", stock: 6 },
          { size: "8", stock: 6 },
          { size: "9", stock: 6 },
        ],
      },
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
    // `slides`, not the legacy heroTitle/heroSubtitle/heroImage trio. Those
    // fields no longer exist on the content type, so seeding them left a fresh
    // database with an empty hero — the exact state a brand-new production
    // project starts in. No media: the carousel renders the copy over the
    // graphite backdrop until an editor uploads artwork.
    slides: [
      {
        eyebrow: "925 Sterling Silver",
        headline: "Jewellery, crafted for\neveryday wear.",
        subline:
          "Timeless 925 sterling silver pieces, designed to be worn every day — not just on special occasions.",
        ctaLabel: "Shop the collection",
        ctaHref: "/products",
        secondaryLabel: "Explore collections",
        secondaryHref: "/collections",
        overlayOpacity: 60,
        isActive: true,
      },
    ],
    searchPlaceholders: [
      { text: "Search for silver rings" },
      { text: "Search for oxidised earrings" },
      { text: "Search for anklets" },
      { text: "Search for gifting" },
    ],
    sections: [
      {
        type: "products",
        title: "New arrivals",
        eyebrow: "Just landed",
        subtitle: "The latest pieces to join the collection, added this month.",
        source: "newest",
        limit: 8,
        viewAllHref: "/products?sort=newest",
        isActive: true,
      },
      {
        type: "products",
        title: "Bestsellers",
        eyebrow: "Most loved",
        subtitle: "The designs our customers keep coming back for.",
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
