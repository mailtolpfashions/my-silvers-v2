/**
 * The system content types — the shape of every CMS form.
 *
 * Extracted from seed.ts so the definitions can be pushed to a database on
 * their OWN, without the seed's other steps (default homepage, admin user,
 * sample catalogue) running again. Editing a field list here and running
 * `npx tsx prisma/sync-content-types.ts` is how an existing database picks the
 * change up; a fresh one still gets it from `npm run db:seed`.
 */
import { FAQ_GROUPS } from "../src/lib/faq";

export const systemContentTypes = [
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
        summaryField: "headline",
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
          {
            name: "mediaMobile",
            label: "Mobile image (optional) — used below 768px, blank reuses the one above",
            type: "image",
          },
          { name: "overlayOpacity", label: "Overlay opacity (0–100)", type: "number" },
          // The header floats OVER the hero in white type, held together by a
          // scrim that has faded to nothing by the header's lower edge — which
          // is exactly where the wordmark, nav and cart sit. That works on
          // photography and fails completely on a pale slide, so a pale slide
          // has to say so. Blank means "light", which is what every slide
          // authored before this field existed wants.
          {
            name: "headerTone",
            label: "Header text over this slide — choose Dark if the artwork is pale",
            type: "select",
            options: ["light", "dark"],
          },
          { name: "isActive", label: "Show this slide", type: "boolean" },
        ],
      },
      // ── Header search ────────────────────────────────────────────────────
      // Site-wide, not homepage-only: the search box lives in the header on
      // every route. It sits on this singleton because that is the only
      // global entry the CMS has — a separate "site settings" type would be
      // a cleaner home if more global chrome copy ever appears.
      {
        name: "searchPlaceholders",
        label: "Search box placeholders — cycled one at a time in the header",
        type: "array",
        summaryField: "text",
        of: [{ name: "text", label: "Placeholder", type: "text" }],
      },
      // ── No `trustItems` ──────────────────────────────────────────────────
      // The trust bar that used to render directly under the hero is gone, and
      // with it the field that fed it. Those claims are not lost: they live in
      // the `usp` section further down the page, which is an ordinary entry in
      // `sections` below and is editable there.
      //
      // Two icon rows saying the same four things on one page was the problem
      // — and the one immediately under the hero was the worse of the two, four
      // small icons competing with the first photograph a shopper ever sees.
      // Removing the field is what stops an editor refilling it and getting a
      // section that no longer renders. Existing entries keep the stale key in
      // their JSON harmlessly; nothing reads it.
      {
        name: "sections",
        label: "Homepage sections — order here is the order on the page",
        type: "array",
        summaryField: "title",
        summaryBadgeField: "type",
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
              "editorialPair",
              "story",
              "categoryTiles",
              "categoryPills",
              "worldTiles",
              "collectionSpotlight",
              "usp",
            ],
            required: true,
          },
          /**
           * Hidden for the two section kinds that throw them away.
           *
           * `categoryTiles` is a full-bleed band whose tiles carry the category
           * names themselves, and `instagram` renders the feed and nothing
           * else — neither reads title, eyebrow or subtitle. Offering the
           * fields anyway is how an editor types a heading, saves, and then
           * goes looking for it on a page that was never going to show it.
           *
           * Stated as exceptions rather than as a list of the ten kinds that DO
           * use them, so a new section type gets a heading by default instead
           * of silently losing one. See showWhen in server/cms/types.ts.
           */
          {
            name: "title",
            label: "Heading",
            type: "text",
            showWhen: { field: "type", notEquals: ["categoryTiles", "instagram"] },
          },
          {
            name: "eyebrow",
            label: "Eyebrow",
            type: "text",
            showWhen: { field: "type", notEquals: ["categoryTiles", "instagram"] },
          },
          {
            name: "subtitle",
            label: "Subtitle — one line under the heading",
            type: "textarea",
            showWhen: { field: "type", notEquals: ["categoryTiles", "instagram"] },
          },
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
            showWhen: { field: "type", equals: ["collections", "collectionSpotlight"] },
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
            showWhen: {
              field: "type",
              equals: [
                "products",
                "collections",
                "collectionSpotlight",
                "categoryTiles",
                "categoryPills",
              ],
            },
          },
          {
            name: "viewAllHref",
            label: "'View all' link (blank to hide)",
            type: "text",
            showWhen: {
              field: "type",
              equals: ["products", "collections", "collectionSpotlight"],
            },
          },
          {
            name: "pinnedReveal",
            label: "Pinned reveal — held to the viewport and uncovered as the section above scrolls off",
            type: "boolean",
            // Only the full-bleed kinds. A padded grid cannot own a viewport:
            // `products` needs its natural height and its own scroll, and
            // `editorialPair`/`editorial` are container-page blocks. Offering
            // the switch there would let an editor build a broken page.
            //
            // `categoryPills` is absent on purpose and is the easiest one to
            // add here by mistake, since it shows the same categories as
            // `categoryTiles` — but it draws them as a padded row of circles,
            // so it belongs with the blocks above, not with the band.
            showWhen: { field: "type", equals: ["categoryTiles", "story", "banner"] },
          },
          {
            name: "layout",
            label: "Arrangement — a row of four, or a staggered 2×2",
            type: "select",
            options: ["row", "stagger"],
            // Only the doorway band has two arrangements. A page can carry one
            // of each by adding two sections.
            showWhen: { field: "type", equals: ["worldTiles"] },
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
            // Required for a `story` — it is the thing being pinned.
            showWhen: { field: "type", equals: ["editorial", "story"] },
          },
          {
            name: "ctaLabel",
            label: "Button label",
            type: "text",
            showWhen: { field: "type", equals: ["editorial", "story"] },
          },
          {
            name: "ctaHref",
            label: "Button link",
            type: "text",
            showWhen: { field: "type", equals: ["editorial", "story"] },
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
            // Shared by two section types on purpose. A `story` reuses the same
            // repeater and reads only each row's Text, so a pinned section
            // needs no second array field on this form — the label explains
            // which column is being read.
            label: "Rows — a 'story' uses each Text as one stage; an 'editorialPair' uses Image, Title as the caption, Text as the link label, and Link; a 'worldTiles' uses Image, Title as the word laid over it, and Link (four rows is the shape it was drawn for)",
            type: "array",
            showWhen: {
              field: "type",
              equals: ["usp", "story", "editorialPair", "worldTiles"],
            },
            of: [
              {
                name: "icon",
                label: "Icon — a Lucide name (shield-check, gem, award…) or an emoji",
                type: "text",
              },
              { name: "title", label: "Title", type: "text" },
              { name: "text", label: "Text", type: "text" },
              // Used by editorialPair only; harmless empty on the other two.
              { name: "image", label: "Image (editorial pair)", type: "image" },
              { name: "href", label: "Link (editorial pair)", type: "text" },
            ],
          },
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
        // `catalogue` is the header artwork on /products; `catalogue-mid` is
        // the editorial break dropped in after the third row of that grid.
        // Both are optional — with nothing published the catalogue falls back
        // to its plain header and an uninterrupted grid.
        options: [
          "homepage-hero",
          "homepage-mid",
          "category",
          "catalogue",
          "catalogue-mid",
        ],
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
  {
    /**
     * Shop-wide product copy, shown as expandable sections on EVERY product
     * page — see components/storefront/product-info-sections.tsx.
     *
     * A singleton rather than fields on Product, deliberately. These three
     * blocks are identical for all 122 pieces: putting them on the model would
     * mean an admin retyping a care guide for every new product, and a change
     * to the returns policy becoming a bulk edit of the whole catalogue. Here
     * it is one entry, edited once.
     *
     * Nothing is seeded into it. Materials, hallmarking, care and returns are
     * business claims — the storefront renders each section only when its field
     * has content, so an unauthored entry simply shows the per-product
     * measurements and nothing more.
     */
    name: "product-info",
    label: "Product information",
    icon: "info",
    isSingleton: true,
    fields: [
      {
        name: "materials",
        label: "Materials & hallmarking — shown on every product page",
        type: "richtext",
      },
      {
        name: "care",
        label: "Care — how to keep the piece looking new",
        type: "richtext",
      },
      {
        name: "shippingReturns",
        label: "Shipping & returns — delivery times and the returns window",
        type: "richtext",
      },
      /**
       * The short assurances that sit beside the buy button — the three or four
       * things a shopper wants settled before spending on silver.
       *
       * ⚠️  Authored rather than coded, and that is the whole point. This was
       * briefly hardcoded, and it could not state the one thing shoppers most
       * want to know, because the codebase carries a standing note:
       *
       *     UNRESOLVED: the homepage trust bar says 15-day returns; the old
       *     product page said 7-day. Neither is asserted anywhere now.
       *
       * A returns window is a promise the business has to honour, and it is not
       * a developer's to invent. Here the owner types the real one, changes it
       * the day it changes, and never needs a deploy to do either.
       *
       * Nothing is seeded. The strip renders only when rows exist, so an
       * unauthored shop simply shows the buy buttons — see
       * components/storefront/product-assurances.tsx.
       */
      {
        name: "assurances",
        label: "Assurances — the short list beside the Add to cart button",
        type: "array",
        summaryField: "label",
        summaryBadgeField: "icon",
        of: [
          {
            name: "label",
            label: "Assurance",
            type: "text",
            required: true,
            placeholder: "925 BIS hallmarked",
          },
          {
            name: "detail",
            label: "Detail — the qualifying half, kept short",
            type: "text",
            placeholder: "Assayed sterling, stamped on every piece",
          },
          {
            /**
             * A fixed set, not a free text field. An icon name typed by hand is
             * a broken icon the day it is misspelled, and the storefront maps
             * these to specific glyphs — see product-assurances.tsx.
             */
            name: "icon",
            label: "Icon",
            type: "select",
            options: ["hallmark", "returns", "shipping", "payment", "support"],
          },
          {
            name: "href",
            label: "Link (optional) — e.g. /p/returns",
            type: "text",
            placeholder: "/p/returns",
          },
        ],
      },
    ],
  },
  {
    /**
     * The FAQ, serving two places from one list.
     *
     * A singleton holding an ARRAY rather than one entry per question, for the
     * same reason `product-info` is a singleton: the order of the array is the
     * order on the page, so reordering is a drag rather than twenty sortOrder
     * fields, and the whole FAQ is one screen to edit and one Publish to ship.
     *
     * ⚠️  `showOnProductPage` is what keeps this ONE list. The /faq page shows
     * everything; a product page shows only the questions flagged here. Two
     * separate lists would mean the returns answer written twice, and the two
     * copies drifting apart is precisely the failure the product-info singleton
     * was built to avoid.
     */
    name: "faq",
    label: "FAQ",
    icon: "help-circle",
    isSingleton: true,
    fields: [
      {
        name: "intro",
        label: "Intro — one line under the heading, optional",
        type: "textarea",
      },
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
          {
            name: "category",
            label: "Group",
            type: "select",
            // Spread, not the const itself — `options` is a mutable string[].
            options: [...FAQ_GROUPS],
          },
          {
            name: "showOnProductPage",
            label: "Also show on every product page",
            type: "boolean",
          },
        ],
      },
    ],
  },
];
