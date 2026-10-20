/**
 * Structure only — safe to run against the PRODUCTION database.
 *
 *   npm run db:seed
 *
 * Creates the CMS content types and a starter homepage, and nothing else. No
 * products, no categories, no users: anything here lands on the live shop, so
 * sample data belongs in seed-demo.ts and the first admin comes from
 * `npm run admin:create`.
 */
import "dotenv/config";
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
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
