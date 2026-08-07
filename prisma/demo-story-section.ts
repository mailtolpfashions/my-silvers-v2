/**
 * DEV-ONLY. Adds (or removes) one demo `story` section on the homepage so the
 * pinned scroll section has something to render.
 *
 * A `story` is the one homepage section that cannot be checked by reading the
 * code: pinning is the most fragile thing in ScrollTrigger — pin spacing,
 * refresh against streamed content, interaction with the position: fixed
 * overlays — and none of it can be exercised without an entry to render.
 *
 * Never run this against production.
 *
 *   tsx prisma/demo-story-section.ts add
 *   tsx prisma/demo-story-section.ts remove
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Marks the section as this script's, so `remove` takes back exactly what it added. */
const DEMO_KEY = "The making of a piece";

const STORY = {
  type: "story",
  title: DEMO_KEY,
  eyebrow: "The craft",
  image: "https://placehold.co/1920x1080/2d2d2d/f7f5f3.png?text=Craft+Story",
  ctaLabel: "See the collection",
  ctaHref: "/products",
  // Read as one stage of copy each — see the `story` branch in
  // src/server/products/homepage-sections.ts.
  items: [
    { text: "Every piece begins as 925 sterling silver, hallmarked before it is ever shaped." },
    { text: "It is finished by hand. The polish that catches the light is nobody's machine." },
    { text: "And it is made to be worn daily, not saved for an occasion that never comes." },
  ],
  isActive: true,
};

type SectionRow = Record<string, unknown>;

async function main() {
  const mode = process.argv[2] === "remove" ? "remove" : "add";

  const type = await prisma.contentType.findUnique({ where: { name: "homepage" } });
  if (!type) throw new Error("No 'homepage' content type — run the base seed first.");

  const entry = await prisma.contentEntry.findFirst({
    where: { contentTypeId: type.id, slug: "homepage" },
  });
  if (!entry) throw new Error("No homepage entry to edit.");

  // Both the draft and the published copy, or the storefront (which reads
  // publishedData) and the CMS form (which reads data) disagree.
  for (const field of ["data", "publishedData"] as const) {
    const doc = entry[field] as { sections?: SectionRow[] } | null;
    if (!doc) continue;

    const sections = (Array.isArray(doc.sections) ? doc.sections : []).filter(
      (s) => s?.title !== DEMO_KEY,
    );
    // Second position: after the first product grid, so the pin is reached by
    // scrolling rather than being the first thing on the page.
    if (mode === "add") sections.splice(1, 0, STORY);

    await prisma.contentEntry.update({
      where: { id: entry.id },
      data: { [field]: { ...doc, sections } },
    });
  }

  const after = await prisma.contentEntry.findUnique({ where: { id: entry.id } });
  const kinds = ((after?.publishedData as { sections?: SectionRow[] })?.sections ?? []).map(
    (s) => s.type,
  );
  console.log(`${mode}: homepage sections are now — ${kinds.join(", ")}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
