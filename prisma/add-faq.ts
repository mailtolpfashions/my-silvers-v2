/**
 * Registers the `faq` content type and fills it with PLACEHOLDER questions.
 *
 *   npx tsx prisma/add-faq.ts --verify   # print what it would do, write nothing
 *   npx tsx prisma/add-faq.ts            # register the type, write the draft
 *
 * ── Why this exists rather than re-running `npm run db:seed` ─────────────────
 * The seed's main() also seeds the homepage, an admin user and the sample
 * catalogue. The `faq` type is now in its systemContentTypes list, so a FRESH
 * database gets it from the seed — this script is how an existing one does,
 * without the other four steps running again.
 *
 * ── ⚠️  THE ANSWERS HERE ARE NOT REAL ────────────────────────────────────────
 * Every answer below is placeholder text, written to exercise the layout while
 * the site is in testing. They deliberately contain NO specific claims — no
 * delivery windows, no returns period, no percentages — because this codebase
 * already carries one unresolved contradiction about the returns window (see
 * the ContentGap in product-info-sections.tsx), and a plausible-sounding
 * invented answer is how that becomes three.
 *
 * Every answer is prefixed "Sample answer —" so it is unmistakable in the CMS
 * and on screen. Replace the text before launch; the questions themselves are
 * ordinary and can stay.
 *
 * ── This writes a DRAFT and never publishes ──────────────────────────────────
 * Publishing is a server action that also calls revalidateTag(), so writing
 * publishedData from a script would change the database while Next carried on
 * serving the old page from cache, with nothing to indicate that had happened.
 * This fills the working draft only. Open CMS → FAQ and press Publish.
 *
 * Idempotent: re-running REPLACES the draft's items rather than appending, so
 * running it twice produces the same draft. It will not overwrite a draft that
 * already contains questions you wrote — pass --force for that.
 */
import { config } from "dotenv";
config();

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { FAQ_GROUPS } from "../src/lib/faq";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  }),
});

const VERIFY_ONLY = process.argv.includes("--verify");
const FORCE = process.argv.includes("--force");

/** Marks every placeholder answer, in the CMS and on screen. */
const SAMPLE = "Sample answer —";

type FaqSeedItem = {
  question: string;
  answer: string;
  category: string;
  showOnProductPage: boolean;
};

/**
 * Placeholder questions, grouped as they will appear.
 *
 * The four flagged `showOnProductPage` are the ones asked while deciding on a
 * specific piece — sizing, hallmarking, delivery, returns. The rest are about
 * the shop rather than the product and belong only on /faq.
 */
const ITEMS: FaqSeedItem[] = [
  {
    question: "How do I place an order?",
    answer: `<p>${SAMPLE} this will describe choosing a piece, adding it to the bag and checking out. Replace before launch.</p>`,
    category: "Ordering & payment",
    showOnProductPage: false,
  },
  {
    question: "Which payment methods do you accept?",
    answer: `<p>${SAMPLE} this will list the accepted payment methods once they are confirmed. Replace before launch.</p>`,
    category: "Ordering & payment",
    showOnProductPage: false,
  },
  {
    question: "Can I order without creating an account?",
    answer: `<p>${SAMPLE} this will explain guest checkout and what an account adds. Replace before launch.</p>`,
    category: "Ordering & payment",
    showOnProductPage: false,
  },
  {
    question: "When will my order arrive?",
    answer: `<p>${SAMPLE} this will give dispatch and delivery timings once they are confirmed with the courier. No timeframe is stated here on purpose. Replace before launch.</p>`,
    category: "Shipping & delivery",
    showOnProductPage: true,
  },
  {
    question: "Do you deliver everywhere in India?",
    answer: `<p>${SAMPLE} this will explain serviceable areas and how the pincode check at checkout works. Replace before launch.</p>`,
    category: "Shipping & delivery",
    showOnProductPage: false,
  },
  {
    question: "How do I track my order?",
    answer: `<p>${SAMPLE} this will explain where the tracking link is sent and where to find it in your account. Replace before launch.</p>`,
    category: "Shipping & delivery",
    showOnProductPage: false,
  },
  {
    question: "What is your returns policy?",
    answer: `<p>${SAMPLE} the returns window is NOT stated here — it is unconfirmed and must come from the business. Replace before launch.</p>`,
    category: "Returns & exchanges",
    showOnProductPage: true,
  },
  {
    question: "How do I exchange a piece for a different size?",
    answer: `<p>${SAMPLE} this will describe the exchange process once it is agreed. Replace before launch.</p>`,
    category: "Returns & exchanges",
    showOnProductPage: false,
  },
  {
    question: "Is your silver hallmarked?",
    answer: `<p>${SAMPLE} this will state the hallmarking and purity position. Hallmarking is a regulated claim and is not drafted here. Replace before launch.</p>`,
    category: "Product & sizing",
    showOnProductPage: true,
  },
  {
    question: "How do I find my ring size?",
    answer: `<p>${SAMPLE} this will explain how to measure at home and how sizes map to the ones listed on each piece. Replace before launch.</p>`,
    category: "Product & sizing",
    showOnProductPage: true,
  },
  {
    question: "Will the silver tarnish?",
    answer: `<p>${SAMPLE} this will explain why sterling silver tarnishes and what to expect over time. Replace before launch.</p>`,
    category: "Care & maintenance",
    showOnProductPage: false,
  },
  {
    question: "How should I clean and store my jewellery?",
    answer: `<p>${SAMPLE} this will cover cleaning and storage. Replace before launch.</p>`,
    category: "Care & maintenance",
    showOnProductPage: false,
  },
];

/** Mirrors the definition in seed.ts — see the note on the `faq` type there. */
const FAQ_CONTENT_TYPE = {
  name: "faq",
  label: "FAQ",
  icon: "help-circle",
  isSingleton: true,
  fields: [
    { name: "intro", label: "Intro — one line under the heading, optional", type: "textarea" },
    {
      name: "items",
      label: "Questions",
      type: "array",
      // Collapsed rows show the question, with its group as a badge.
      summaryField: "question",
      summaryBadgeField: "category",
      of: [
        { name: "question", label: "Question", type: "text", required: true },
        { name: "answer", label: "Answer", type: "richtext", required: true },
        { name: "category", label: "Group", type: "select", options: [...FAQ_GROUPS] },
        {
          name: "showOnProductPage",
          label: "Also show on every product page",
          type: "boolean",
        },
      ],
    },
  ],
};

async function main() {
  const unknownGroups = ITEMS.filter(
    (item) => !(FAQ_GROUPS as readonly string[]).includes(item.category)
  );
  if (unknownGroups.length > 0) {
    throw new Error(
      `These placeholder items use a group that is not in FAQ_GROUPS: ${unknownGroups
        .map((i) => i.question)
        .join(", ")}`
    );
  }

  const onProduct = ITEMS.filter((i) => i.showOnProductPage);
  console.log(`FAQ placeholder: ${ITEMS.length} questions across ${FAQ_GROUPS.length} groups.`);
  console.log(`  ${onProduct.length} flagged for product pages:`);
  for (const item of onProduct) console.log(`    · ${item.question}`);

  if (VERIFY_ONLY) {
    const existing = await prisma.contentType.findUnique({ where: { name: "faq" } });
    console.log(`\n--verify: content type ${existing ? "EXISTS" : "does not exist yet"}.`);
    console.log("--verify: nothing written.");
    return;
  }

  const type = await prisma.contentType.upsert({
    where: { name: FAQ_CONTENT_TYPE.name },
    update: {
      label: FAQ_CONTENT_TYPE.label,
      icon: FAQ_CONTENT_TYPE.icon,
      isSingleton: FAQ_CONTENT_TYPE.isSingleton,
      fields: FAQ_CONTENT_TYPE.fields,
    },
    create: { ...FAQ_CONTENT_TYPE, isSystem: true },
  });
  console.log("\n✅ Content type `faq` registered.");

  const existing = await prisma.contentEntry.findFirst({
    where: { contentTypeId: type.id },
  });

  // Refuse to clobber real work. A draft holding questions that are not ours is
  // someone having started writing, and this script is not worth losing it for.
  if (existing && !FORCE) {
    const draft = (existing.data ?? {}) as { items?: unknown };
    const items = Array.isArray(draft.items) ? draft.items : [];
    const authored = items.some((item) => {
      const answer = (item as { answer?: unknown }).answer;
      return typeof answer === "string" && !answer.includes(SAMPLE);
    });
    if (authored) {
      console.log(
        "\n⚠️  The FAQ draft already contains answers that are not placeholders — leaving it alone.\n" +
          "   Re-run with --force to replace them."
      );
      return;
    }
  }

  const data = { intro: "", items: ITEMS };

  if (existing) {
    await prisma.contentEntry.update({ where: { id: existing.id }, data: { data } });
    console.log("✅ Replaced the FAQ draft's questions.");
  } else {
    await prisma.contentEntry.create({
      data: { contentTypeId: type.id, slug: "faq", status: "draft", data },
    });
    console.log("✅ Created the FAQ draft.");
  }

  console.log(
    "\nNothing is on the storefront yet — this wrote a DRAFT.\n" +
      "   Open /cms/content/faq and press Publish.\n" +
      "   ⚠️  Every answer is placeholder text. Replace it before going live."
  );
}

main()
  .catch((err) => {
    console.error("add-faq failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
