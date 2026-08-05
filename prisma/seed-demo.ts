/**
 * DEV-ONLY demo catalogue — ~120 products across 6 categories, for testing
 * listing pages, filters, search, pagination, cart and checkout.
 *
 * Never run this against production. Images use placehold.co, which is
 * allowlisted only outside production (see src/server/media/url-allowlist.ts
 * and next.config.ts) — so this data cannot render or be re-saved on prod.
 *
 *   npm run db:seed:demo
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// ─── Safety gate ────────────────────────────────────────────────────────────
// Refuses to run unless DATABASE_URL points at the dev Supabase project.
// Update this ref if you move the dev database.
const DEV_PROJECT_REF = "skyifgumokdwcgwjupvr";

const url = process.env.DATABASE_URL ?? "";
if (!url.includes(DEV_PROJECT_REF) && !url.includes("localhost")) {
  console.error(
    "\n✋ Refusing to run the demo seed.\n" +
      `   DATABASE_URL does not point at the dev project (${DEV_PROJECT_REF}).\n` +
      "   This script is for testing data only and must never touch production.\n"
  );
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ─── Deterministic pseudo-random ────────────────────────────────────────────
// Seeded so re-running produces the same catalogue (stable slugs/SKUs).
let seedState = 20260802;
function rand(): number {
  seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
  return seedState / 0x7fffffff;
}
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

// ─── Vocabulary ─────────────────────────────────────────────────────────────

const CATEGORIES = [
  {
    name: "Rings", slug: "rings", sortOrder: 1, icon: "circle",
    description: "Sterling silver rings for everyday wear and special occasions.",
    styles: ["Classic Band", "Solitaire", "Twisted Vine", "Signet", "Stacking", "Eternity", "Oxidised Dome", "Filigree", "Hammered Band", "Open Cuff"],
    sizes: ["6", "7", "8", "9", "10"],
    weight: [2.4, 6.5],
    price: [899, 4499],
  },
  {
    name: "Earrings", slug: "earrings", sortOrder: 2, icon: "flower",
    description: "Studs, hoops and drops in 925 sterling silver.",
    styles: ["Pearl Drop", "Classic Hoop", "Threader", "Huggie", "Chandelier", "Ear Cuff", "Minimal Stud", "Jhumka", "Star Stud", "Crescent Hoop"],
    sizes: [],
    weight: [1.8, 8.2],
    price: [749, 5999],
  },
  {
    name: "Necklaces", slug: "necklaces", sortOrder: 3, icon: "gem",
    description: "Chains, pendants and layered necklaces in sterling silver.",
    styles: ["Rope Chain", "Box Chain", "Herringbone", "Layered Coin", "Snake Chain", "Curb Chain", "Beaded Station", "Lariat", "Choker", "Figaro Chain"],
    sizes: ["16 in", "18 in", "20 in", "22 in"],
    weight: [4.5, 18.0],
    price: [1299, 8999],
  },
  {
    name: "Bracelets", slug: "bracelets", sortOrder: 4, icon: "circle-dot",
    description: "Cuffs, chains and charm bracelets in 925 silver.",
    styles: ["Charm", "Tennis", "Cuban Link", "Bangle Cuff", "Beaded", "Rope Twist", "Flat Curb", "Oxidised Cuff", "Anchor Link", "Slim Bangle"],
    sizes: ["S", "M", "L"],
    weight: [5.0, 22.0],
    price: [1099, 7499],
  },
  {
    name: "Anklets", slug: "anklets", sortOrder: 5, icon: "sparkles",
    description: "Traditional and contemporary silver anklets.",
    styles: ["Ghungroo", "Beaded Chain", "Double Layer", "Charm Drop", "Flat Link", "Payal Classic", "Minimal Chain", "Bell Anklet", "Twisted Rope", "Star Charm"],
    sizes: ["9 in", "10 in", "11 in"],
    weight: [6.0, 24.0],
    price: [999, 4999],
  },
  {
    name: "Pendants", slug: "pendants", sortOrder: 6, icon: "heart",
    description: "Standalone sterling silver pendants and lockets.",
    styles: ["Om", "Evil Eye", "Initial", "Moonstone", "Tree of Life", "Heart Locket", "Compass", "Lotus", "Zodiac Disc", "Feather"],
    sizes: [],
    weight: [1.5, 9.0],
    price: [699, 3999],
  },
] as const;

const FINISHES = ["Polished", "Oxidised", "Matte", "Rhodium-Plated", "Rose-Gold Plated", "Brushed"] as const;
const STONES = ["Cubic Zirconia", "Freshwater Pearl", "Moonstone", "Onyx", "Turquoise", "Garnet", "No Stone"] as const;
const OCCASION_TAGS = ["everyday", "gifting", "bridal", "festive", "office", "party", "minimal", "statement"] as const;

// Brand-coloured placeholders: --surface background, --ink text.
// The `.png` extension is required — placehold.co serves SVG by default, and
// next/image rejects SVG ("image type is not allowed") unless the risky
// dangerouslyAllowSVG flag is turned on.
function placeholder(label: string, variant: number): string {
  // No FFFDF8 here — that is --ivory, the page background, so those cards
  // rendered as invisible blanks. Every tint must contrast with the page.
  const bg = ["F7F5F3", "F5ECD9", "F5E6E0", "EDE8E2"][variant % 4];
  const text = encodeURIComponent(label.slice(0, 40));
  // Square, matching the aspect-square tile in ProductCard — a non-square
  // source would be centre-cropped by object-cover and lose its label.
  return `https://placehold.co/900x900/${bg}/0C0C0E.png?text=${text}`;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ─── Build ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding demo catalogue…\n");

  let created = 0;
  let skuCounter = 100;

  for (const category of CATEGORIES) {
    const cat = await prisma.category.upsert({
      where: { slug: category.slug },
      // Refresh the image on re-run so URL-format fixes reach existing rows.
      update: { image: placeholder(category.name, category.sortOrder) },
      create: {
        name: category.name,
        slug: category.slug,
        description: category.description,
        image: placeholder(category.name, category.sortOrder),
        // Shown beside the label in the header nav; editable per category
        // in /admin/categories. Without it the nav renders label-only.
        icon: category.icon,
        sortOrder: category.sortOrder,
      },
    });

    // 20 products per category → 120 total.
    for (let i = 0; i < 20; i++) {
      const style = category.styles[i % category.styles.length];
      const finish = pick(FINISHES);
      const stone = pick(STONES);
      const variantNo = Math.floor(i / category.styles.length) + 1;

      const singular = category.name.replace(/s$/, "");
      const name =
        variantNo > 1
          ? `${finish} ${style} ${singular} ${["II", "III"][variantNo - 2] ?? variantNo}`
          : `${finish} ${style} ${singular}`;

      const slug = slugify(name);
      const sku = `MYS-${category.slug.slice(0, 3).toUpperCase()}-${String(skuCounter++).padStart(4, "0")}`;

      const price = between(category.price[0], category.price[1]);
      // ~45% of products carry a strike-through compare-at price.
      const hasDiscount = rand() < 0.45;
      const compareAtPrice = hasDiscount ? Math.round(price * (1.15 + rand() * 0.4)) : null;

      // A realistic spread: a few out of stock, a few low, most healthy.
      const stockRoll = rand();
      const stock = stockRoll < 0.08 ? 0 : stockRoll < 0.22 ? between(1, 4) : between(8, 90);

      const weight = +(
        category.weight[0] +
        rand() * (category.weight[1] - category.weight[0])
      ).toFixed(2);

      const tags = Array.from(
        new Set([
          category.slug,
          finish.toLowerCase().replace(/\s+/g, "-"),
          pick(OCCASION_TAGS),
          pick(OCCASION_TAGS),
          ...(stone !== "No Stone" ? [slugify(stone)] : []),
        ])
      );

      const description =
        `A ${finish.toLowerCase()} ${style.toLowerCase()} ${singular.toLowerCase()} in 925 BIS ` +
        `hallmarked sterling silver${stone !== "No Stone" ? `, set with ${stone.toLowerCase()}` : ""}. ` +
        `Hand-finished by our artisans and designed to hold its shine through daily wear. ` +
        `Comes in a MY Silvers gift box with an anti-tarnish pouch.`;

      const images = [
        placeholder(name, i),
        placeholder(`${style} detail`, i + 1),
        placeholder(`${style} on model`, i + 2),
      ];

      await prisma.product.upsert({
        where: { sku },
        // Only images are refreshed on re-run — any other edits you make to a
        // demo product through the admin panel are preserved.
        update: { images },
        create: {
          name,
          slug,
          description,
          shortDescription: `${finish} ${style.toLowerCase()} ${singular.toLowerCase()} in 925 sterling silver.`,
          price,
          compareAtPrice,
          images,
          categoryId: cat.id,
          weight,
          dimensions: category.slug === "rings" ? `${between(2, 8)} mm band` : null,
          sizes: [...category.sizes],
          // Per-size stock, split evenly with the remainder to the earliest
          // sizes — the same rule as the 20260805190000 migration, so a fresh
          // database and a backfilled one agree.
          variants: {
            create: category.sizes.map((size, si) => ({
              size,
              stock:
                Math.floor(stock / category.sizes.length) +
                (si < stock % category.sizes.length ? 1 : 0),
            })),
          },
          material: stone !== "No Stone" ? `925 Sterling Silver with ${stone}` : "925 Sterling Silver",
          stock,
          sku,
          isFeatured: rand() < 0.12,
          isBestseller: rand() < 0.15,
          isActive: rand() > 0.04, // ~4% inactive, to exercise soft-delete filtering
          tags,
        },
      });
      created++;
    }

    console.log(`  ${category.name.padEnd(10)} 20 products`);
  }

  const totals = await prisma.product.aggregate({
    _count: true,
    _min: { price: true },
    _max: { price: true },
  });
  const featured = await prisma.product.count({ where: { isFeatured: true } });
  const bestsellers = await prisma.product.count({ where: { isBestseller: true } });
  const outOfStock = await prisma.product.count({ where: { stock: 0 } });
  const inactive = await prisma.product.count({ where: { isActive: false } });

  console.log(`\n✅ ${created} demo products seeded.`);
  console.log(`   Total in DB:  ${totals._count}`);
  console.log(`   Price range:  ₹${totals._min.price} – ₹${totals._max.price}`);
  console.log(`   Featured:     ${featured}`);
  console.log(`   Bestsellers:  ${bestsellers}`);
  console.log(`   Out of stock: ${outOfStock}`);
  console.log(`   Inactive:     ${inactive}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
