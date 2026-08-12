import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { Prisma } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/**
 * One-off: adds the `headerTone` field to the homepage type's `slides` array.
 *
 * The field definition also lives in seed.ts, which is the source of truth for a
 * fresh install. This exists because seed.ts does more than content types, and
 * re-running the whole thing against a database that already has content is a
 * bigger hammer than adding one select needs.
 *
 * Surgical and idempotent: it reads the stored field JSON, inserts the select
 * just before `isActive` if it is missing, and writes it back. It touches no
 * entry data, so existing slides keep their content and simply render as
 * "light" — which is what they already look like.
 *
 *   npx tsx prisma/add-hero-header-tone.ts
 */
type Field = { name: string; [key: string]: unknown };

const HEADER_TONE: Field = {
  name: "headerTone",
  label: "Header text over this slide — choose Dark if the artwork is pale",
  type: "select",
  options: ["light", "dark"],
};

async function main() {
  const type = await prisma.contentType.findUnique({ where: { name: "homepage" } });
  if (!type) throw new Error("No `homepage` content type — run the seed first.");

  const fields = type.fields as unknown as Field[];
  if (!Array.isArray(fields)) throw new Error("`fields` is not an array; refusing to guess.");

  const slides = fields.find((f) => f.name === "slides");
  if (!slides) throw new Error("No `slides` field on the homepage type.");

  const of = slides.of as Field[] | undefined;
  if (!Array.isArray(of)) throw new Error("`slides.of` is not an array; refusing to guess.");

  if (of.some((f) => f.name === "headerTone")) {
    console.log("headerTone is already there — nothing to do.");
    return;
  }

  // Just before `isActive`, matching seed.ts, so the editor sees the same order
  // whether the type was seeded fresh or migrated.
  const at = of.findIndex((f) => f.name === "isActive");
  of.splice(at === -1 ? of.length : at, 0, HEADER_TONE);

  await prisma.contentType.update({
    where: { name: "homepage" },
    data: { fields: fields as unknown as Prisma.InputJsonValue },
  });

  console.log(`Added headerTone to homepage.slides (now ${of.length} fields).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
