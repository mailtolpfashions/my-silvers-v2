import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { Prisma } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/**
 * One-off: moves `heroSlide` entries onto the homepage entry's `slides` array.
 *
 * Hero content used to live in two places — the heroSlide content type and a
 * parallel set of hero* fields on the homepage — with slides silently winning.
 * Slides are now part of the homepage document, so there is one source.
 *
 * Safe to run more than once: it refuses to overwrite a homepage that already
 * has slides, and it only deletes the old entries after the copy is verified.
 *
 *   npx tsx prisma/migrate-hero-slides.ts          # copy, keep old entries
 *   npx tsx prisma/migrate-hero-slides.ts --cleanup # copy, then remove them
 */
const CLEANUP = process.argv.includes("--cleanup");

type Slide = Record<string, unknown>;

/** Array position replaces sortOrder, so order by it once, here. */
function toSlide(data: Record<string, unknown>): Slide {
  return {
    eyebrow: data.eyebrow ?? "",
    headline: data.headline ?? "",
    subline: data.subline ?? "",
    ctaLabel: data.ctaLabel ?? "",
    ctaHref: data.ctaHref ?? "",
    secondaryLabel: data.secondaryLabel ?? "",
    secondaryHref: data.secondaryHref ?? "",
    media: data.media ?? "",
    overlayOpacity: data.overlayOpacity ?? 50,
    isActive: data.isActive !== false,
  };
}

async function main() {
  const heroType = await prisma.contentType.findUnique({ where: { name: "heroSlide" } });
  if (!heroType) {
    console.log("No heroSlide content type — nothing to migrate.");
    return;
  }

  const entries = await prisma.contentEntry.findMany({
    where: { contentTypeId: heroType.id },
    orderBy: { createdAt: "asc" },
  });

  // Prefer publishedData: that's what the storefront was actually showing.
  const slides = entries
    .map((e) => ({
      data: (e.publishedData ?? e.data) as Record<string, unknown>,
      slug: e.slug,
    }))
    .filter((e) => typeof e.data?.headline === "string" && e.data.headline.trim() !== "")
    .sort((a, b) => Number(a.data.sortOrder ?? 0) - Number(b.data.sortOrder ?? 0))
    .map((e) => {
      console.log(`  · ${e.slug} → "${String(e.data.headline).split("\n")[0]}"`);
      return toSlide(e.data);
    });

  console.log(`Found ${slides.length} slide(s) to migrate.`);

  const homepageType = await prisma.contentType.findUnique({ where: { name: "homepage" } });
  const homepage = homepageType
    ? await prisma.contentEntry.findFirst({ where: { contentTypeId: homepageType.id } })
    : null;

  if (!homepage) {
    console.error("No homepage entry found — run `npm run db:seed` first.");
    process.exitCode = 1;
    return;
  }

  const draft = (homepage.data ?? {}) as Record<string, unknown>;
  const published = (homepage.publishedData ?? null) as Record<string, unknown> | null;

  // Skips the copy but must NOT return: on a second run with --cleanup the copy
  // is already done and cleanup is the only thing left to do.
  const alreadyCopied = Array.isArray(draft.slides) && draft.slides.length > 0;

  if (alreadyCopied) {
    console.log(
      `Homepage already has ${(draft.slides as unknown[]).length} slide(s) — leaving them untouched.`
    );
  } else if (slides.length > 0) {
    // Both copies: publishedData is what the live site reads, data is what the
    // editor opens. Writing only one would make the Studio and the storefront
    // disagree until the next publish.
    await prisma.contentEntry.update({
      where: { id: homepage.id },
      data: {
        data: { ...draft, slides } as Prisma.InputJsonValue,
        ...(published
          ? { publishedData: { ...published, slides } as Prisma.InputJsonValue }
          : {}),
      },
    });
    console.log(`Copied ${slides.length} slide(s) onto the homepage entry.`);
  }

  if (!CLEANUP) {
    console.log(
      "\nOld heroSlide entries left in place. Re-run with --cleanup to remove them\n" +
        "once you've confirmed the homepage looks right."
    );
    return;
  }

  // Never delete the source unless the destination actually holds the slides —
  // re-read rather than trusting the copy above, so a failed write can't be
  // followed by a successful delete.
  const after = await prisma.contentEntry.findUnique({ where: { id: homepage.id } });
  const landed = (after?.data as Record<string, unknown> | null)?.slides;
  if (!Array.isArray(landed) || landed.length === 0) {
    console.error(
      "Refusing to clean up: the homepage entry has no slides, so deleting the\n" +
        "heroSlide entries would lose them. Run without --cleanup first."
    );
    process.exitCode = 1;
    return;
  }

  await prisma.contentEntry.deleteMany({ where: { contentTypeId: heroType.id } });
  await prisma.contentType.delete({ where: { id: heroType.id } });
  console.log(`Removed ${entries.length} heroSlide entr(ies) and the content type.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
