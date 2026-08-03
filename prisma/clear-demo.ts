/**
 * Removes demo products (dev only) — identified by their placehold.co images,
 * so anything you created yourself through the admin panel is left alone.
 *
 *   npm run db:clear:demo
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const DEV_PROJECT_REF = "skyifgumokdwcgwjupvr";

const url = process.env.DATABASE_URL ?? "";
if (!url.includes(DEV_PROJECT_REF) && !url.includes("localhost")) {
  console.error("\n✋ Refusing to run — DATABASE_URL is not the dev project.\n");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Prisma's array filters can't do a prefix match, so filter in JS.
  const all = await prisma.product.findMany({
    select: { id: true, images: true, orderItems: { select: { id: true }, take: 1 } },
  });
  const demoIds = all
    .filter((p) => p.images.some((img) => img.startsWith("https://placehold.co/")))
    .filter((p) => p.orderItems.length === 0) // keep anything with order history
    .map((p) => p.id);

  const skippedForOrders = all.filter(
    (p) =>
      p.images.some((img) => img.startsWith("https://placehold.co/")) &&
      p.orderItems.length > 0
  ).length;

  if (demoIds.length === 0) {
    console.log("No demo products to remove.");
    return;
  }

  // Clear child rows first — these have no historical value in dev.
  await prisma.cartItem.deleteMany({ where: { productId: { in: demoIds } } });
  await prisma.review.deleteMany({ where: { productId: { in: demoIds } } });
  const removed = await prisma.product.deleteMany({ where: { id: { in: demoIds } } });

  console.log(`\n✅ Removed ${removed.count} demo products.`);
  if (skippedForOrders > 0) {
    console.log(`   Kept ${skippedForOrders} that have order history.`);
  }
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
