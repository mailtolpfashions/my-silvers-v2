/**
 * Writes the footer's policy and information pages into the CMS as DRAFTS.
 *
 *   npx tsx prisma/add-footer-pages.ts --verify      # print what it would do
 *   npx tsx prisma/add-footer-pages.ts               # write drafts (dev .env)
 *   npm run live -- npx tsx prisma/add-footer-pages.ts   # write drafts on LIVE
 *
 * ── Every claim here was confirmed by the business ───────────────────────────
 * The footer links to /p/<slug>; these entries are what those links open.
 * Business facts come from the GST certificate and the owner's answers
 * (Nov 2026), and the shop settings in the database:
 *   · registered as MY Silvers, GSTIN 33AMKPY0103A1ZN, Chengam, Tamil Nadu
 *   · 925 sterling silver, made in India — NOT every piece is hallmarked, so
 *     no page here says "hallmarked"
 *   · no change-of-mind returns; damaged / defective / wrong item reported
 *     within 48 hours with an unboxing video → refund or exchange
 *   · dispatch 1–2 business days, delivery 3–7 business days
 *   · ₹49 delivery, free at ₹999 and above (StoreSetting "store"), prepaid only
 *   · customers can cancel from their account until the order ships, with an
 *     automatic full refund (src/server/orders/cancel-order.ts)
 * The privacy policy describes what the code actually collects and which
 * services receive it. If any of that changes, this text must change with it.
 *
 * Gaps the business has not answered yet are wrapped in <mark>To be added: …
 * </mark> — highlighted on screen, impossible to miss. Do not publish a page
 * while one remains.
 *
 * ── Drafts only ──────────────────────────────────────────────────────────────
 * Publishing goes through the CMS so the storefront cache is invalidated (see
 * the note in add-faq.ts). Open CMS → Pages, read, press Publish.
 *
 * Skips any slug that already exists, unless --force (which overwrites the
 * DRAFT only, after saving the old draft as a version).
 */
import { config } from "dotenv";
config();

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { sanitizeRichText } from "../src/server/cms/sanitize";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  }),
});

const VERIFY_ONLY = process.argv.includes("--verify");
const FORCE = process.argv.includes("--force");

const EMAIL = "support@mysilvers.in";
const mail = `<a href="mailto:${EMAIL}">${EMAIL}</a>`;
const SITE = "https://www.mysilvers.in";
const link = (path: string, text: string) => `<a href="${SITE}${path}">${text}</a>`;
const gap = (what: string) => `<mark>To be added: ${what}</mark>`;

type PageSeed = {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  /** Without the brand — the root layout's title template appends "| MY Silvers". */
  metaTitle: string;
  metaDescription: string;
};

const BUSINESS_BLOCK = `
<p><strong>MY Silvers</strong><br>
No. 75, Perumal Kovil Street, Chengam,<br>
Tiruvannamalai District, Tamil Nadu – 606701, India<br>
GSTIN: 33AMKPY0103A1ZN<br>
Email: ${mail}</p>`;

const GRIEVANCE_BLOCK = `
<h2>Grievance Officer</h2>
<p>If you are not happy with how we handled a complaint or your personal data, you can write to our Grievance Officer. We acknowledge every complaint within 48 hours and aim to resolve it within one month.</p>
<p>Name: Mugundan M P<br>
Email: ${mail}<br>
Address: MY Silvers, No. 75, Perumal Kovil Street, Chengam, Tiruvannamalai District, Tamil Nadu – 606701</p>`;

const PAGES: PageSeed[] = [
  // ── Shipping ──────────────────────────────────────────────────────────────
  {
    slug: "shipping",
    title: "Shipping & delivery",
    excerpt:
      "Every order is packed by hand and dispatched within 1–2 business days. Delivery is free on orders of ₹999 and above.",
    metaTitle: "Shipping & Delivery – Free Above ₹999",
    metaDescription:
      "MY Silvers ships 925 sterling silver jewellery across India. Dispatch in 1–2 days, delivery in 3–7 days, free shipping on orders of ₹999 and above.",
    content: `
<h2>Delivery charges</h2>
<ul>
<li><strong>Free delivery</strong> on orders of <strong>₹999 and above</strong>.</li>
<li>A flat <strong>₹49</strong> on orders below ₹999.</li>
</ul>
<p>The delivery charge is shown in your bag and at checkout before you pay — there are no extra charges at your door.</p>

<h2>How long it takes</h2>
<ul>
<li><strong>Dispatch:</strong> we pack and hand your order to the courier within <strong>1–2 business days</strong> of payment.</li>
<li><strong>Delivery:</strong> most orders arrive <strong>3–7 business days</strong> after dispatch.</li>
</ul>
<p>Metro cities are usually at the faster end. Smaller towns and remote pin codes can take a little longer, and festivals, strikes or bad weather can add a day or two. Business days are Monday to Saturday, excluding public holidays.</p>

<h2>Where we deliver</h2>
<p>We deliver to pin codes across India through our courier partners. If your pin code cannot be served, checkout will tell you before you pay. We do not ship outside India at the moment.</p>

<h2>Payment</h2>
<p>All orders are prepaid online — UPI, debit and credit cards, net banking and wallets — through Razorpay's secure checkout. Cash on Delivery is not available right now.</p>

<h2>Tracking your order</h2>
<p>As soon as your order is dispatched, we email you the courier's tracking details. You can also follow it any time on our ${link("/track-order", "Track your order")} page, or under <strong>Your orders</strong> if you have an account.</p>

<h2>When your parcel arrives</h2>
<p>Please <strong>record an unboxing video</strong> as you open the parcel — one continuous video, starting from the sealed package. If anything is damaged or wrong, that video is what lets us sort it out quickly. If the outer packaging looks torn or tampered with, you can refuse the delivery and write to us.</p>
<p>Damaged or wrong item? Tell us within 48 hours — see our ${link("/p/returns", "Returns & exchanges")} policy.</p>

<h2>Cancelling before dispatch</h2>
<p>You can cancel an order from <strong>Your orders</strong> until it is dispatched, and the full amount is refunded automatically to your original payment method. If you checked out as a guest, email ${mail} with your order number and we'll cancel it for you.</p>

<h2>Wrong address or missed delivery</h2>
<p>Please check your address, pin code and phone number at checkout — the courier calls that number before delivering. If you spot a mistake, email us straight away; we can correct it until the order is dispatched. If a parcel comes back to us undelivered, we'll contact you to arrange re-delivery or a refund.</p>

<h2>Questions?</h2>
<p>Write to ${mail} with your order number and we'll help.</p>`,
  },

  // ── Returns ───────────────────────────────────────────────────────────────
  {
    slug: "returns",
    title: "Returns & exchanges",
    excerpt:
      "If your jewellery arrives damaged, defective or isn't what you ordered, tell us within 48 hours and choose a refund or an exchange.",
    metaTitle: "Returns, Exchanges & Refund Policy",
    metaDescription:
      "Damaged, defective or wrong item? Report it within 48 hours with an unboxing video and choose a refund or exchange. Read the MY Silvers returns policy.",
    content: `
<h2>Our policy in short</h2>
<ul>
<li>We <strong>do not accept returns or exchanges for a change of mind</strong>, including size.</li>
<li>If your order arrives <strong>damaged, defective, or is not what you ordered</strong>, we'll put it right — <strong>a refund or an exchange, your choice</strong>.</li>
<li>You must tell us <strong>within 48 hours of delivery</strong>, with an <strong>unboxing video</strong>.</li>
</ul>
<p>Jewellery is worn close to the skin, so for hygiene and to keep every piece we sell as new, we can't take back pieces that have been tried on or worn. Please check sizes on the product page before ordering, and write to us if you are unsure — we're happy to help you choose.</p>

<h2>What counts as damaged, defective or wrong</h2>
<ul>
<li>The piece is broken, bent, scratched or missing a stone when it arrives.</li>
<li>A clasp, hook or screw doesn't work.</li>
<li>You received a different design, size or quantity from what you ordered.</li>
</ul>
<p>Natural variations in handcrafted or oxidised pieces, and tarnish that develops with wear, are not defects — see our ${link("/p/care-guide", "Silver care guide")}.</p>

<h2>How to report a problem</h2>
<ol>
<li>Email ${mail} <strong>within 48 hours of delivery</strong>.</li>
<li>Include your <strong>order number</strong>, a short description and <strong>clear photos</strong> of the piece.</li>
<li>Attach or share a link to your <strong>unboxing video</strong> — one continuous recording that starts with the sealed parcel and shows the piece being taken out. We can't accept a claim without it.</li>
</ol>
<p>We reply within 2 business days to confirm the claim and explain how to send the piece back. ${gap("who pays return postage for a damaged/wrong item, and whether you arrange pickup")}</p>
<p>The piece must come back unused, in its original packaging, with any tags or certificates it came with.</p>

<h2>Refund or exchange</h2>
<p>Once the piece reaches us and we've checked it, you choose:</p>
<ul>
<li><strong>Exchange</strong> — the same piece in good condition, or a different piece. If the new piece costs more, you pay the difference; if it costs less, we refund the difference.</li>
<li><strong>Refund</strong> — the full amount you paid for that piece, back to your original payment method.</li>
</ul>

<h2>When will I see my refund?</h2>
<p>We start the refund as soon as the returned piece has been checked. It goes back through Razorpay to the method you paid with. Banks usually show it within <strong>5–7 business days</strong>; UPI refunds are often faster.</p>

<h2>Cancellations</h2>
<p>You can cancel an order from <strong>Your orders</strong> any time before it is dispatched, and we refund the full amount automatically. Guest orders can be cancelled by emailing ${mail} with your order number. Once an order has been dispatched it can no longer be cancelled.</p>
<p>If we ever have to cancel your order — for example, if a piece goes out of stock after you have paid — we refund you in full automatically.</p>

<h2>Questions?</h2>
<p>Write to ${mail}. See also ${link("/p/shipping", "Shipping & delivery")}.</p>`,
  },

  // ── Care guide ────────────────────────────────────────────────────────────
  {
    slug: "care-guide",
    title: "Silver care guide",
    excerpt:
      "Sterling silver loves to be worn. A few simple habits keep it bright for years — here is how to wear, clean and store your pieces.",
    metaTitle: "How to Care for Silver Jewellery – Care Guide",
    metaDescription:
      "How to clean 925 sterling silver jewellery, stop tarnish and store it properly — plus care tips for oxidised and plated silver pieces. A simple guide.",
    content: `
<h2>Why silver tarnishes</h2>
<p>925 sterling silver is 92.5% pure silver mixed with a little copper for strength. When it meets sulphur in the air, sweat, perfume or humidity, a thin dark layer forms on the surface — that's tarnish. It is natural, it doesn't mean the silver is fake, and it can almost always be cleaned away. In humid weather and during the monsoon it simply happens faster.</p>

<h2>The best habit: wear it</h2>
<p>Silver that is worn often tarnishes less, because gentle rubbing against skin and clothes keeps the surface clean. Pieces left in a drawer for months are the ones that darken.</p>

<h2>Last on, first off</h2>
<p>Put your jewellery on after perfume, lotion, hair oil and make-up have dried, and take it off before you:</p>
<ul>
<li>bathe, swim or go into a pool or the sea (chlorine and salt water are hard on silver),</li>
<li>exercise, do housework or cook,</li>
<li>apply haldi, kumkum, mehendi or sandal paste at a function or pooja,</li>
<li>sleep — chains and fine pieces can catch and bend.</li>
</ul>

<h2>Everyday cleaning</h2>
<ul>
<li>After wearing, wipe the piece with a soft, dry cotton cloth to remove sweat and oils.</li>
<li>For a deeper clean, a <strong>silver polishing cloth</strong> brings back the shine in seconds.</li>
<li>For dirt in the details, wash briefly in lukewarm water with a drop of mild soap, use a very soft toothbrush, rinse, and <strong>dry completely</strong> before storing.</li>
</ul>
<p>Avoid toothpaste, baking soda, lemon, vinegar and household cleaners — they scratch the surface or damage stones and finishes.</p>

<h2>Oxidised silver</h2>
<p>Oxidised pieces are darkened on purpose to bring out the design. <strong>Don't use a polishing cloth or silver dip</strong> on them — it removes the dark finish. Just wipe gently with a soft dry cloth.</p>

<h2>Rhodium- and rose-gold-plated silver</h2>
<p>Plating is a thin layer on top of the silver. Wipe it with a soft, dry cloth only; skip polishing cloths and cleaning liquids, and keep it away from perfume and water so the finish lasts longer.</p>

<h2>Pieces with stones</h2>
<p>Don't soak them — water can loosen the setting. Clean around the stones with a soft brush, and check now and then that they are secure.</p>

<h2>Storing your silver</h2>
<ul>
<li>Keep each piece in its own <strong>zip-lock pouch</strong> with the air pressed out, or in the pouch it came in.</li>
<li>Store pieces separately so they don't scratch or tangle — especially chains and anklets.</li>
<li>Choose a cool, dry place — not the bathroom.</li>
<li>An anti-tarnish strip, a piece of chalk or a silica gel sachet in the box absorbs moisture.</li>
</ul>

<h2>When to get help</h2>
<p>If a piece is badly tarnished, or a clasp or setting feels loose, write to us at ${mail} before trying anything harsh — we're happy to advise.</p>

<p>Looking for something new to wear every day? ${link("/products", "Browse all jewellery")}.</p>`,
  },

  // ── Privacy ───────────────────────────────────────────────────────────────
  {
    slug: "privacy",
    title: "Privacy policy",
    excerpt:
      "What we collect when you shop with MY Silvers, why we need it, who we share it with, and the choices you have.",
    metaTitle: "Privacy Policy",
    metaDescription:
      "How MY Silvers collects, uses and protects your personal data when you shop with us, and your rights under India's Digital Personal Data Protection Act.",
    content: `
<p><em>Last updated: November 2026</em></p>
<p>This policy explains how MY Silvers ("we", "us") handles your personal data when you visit www.mysilvers.in or buy from us. We follow India's Digital Personal Data Protection Act, 2023 and the Information Technology Act, 2000 and its rules. We only collect what we need to sell and deliver your jewellery and look after you as a customer.</p>

<h2>Who we are</h2>
${BUSINESS_BLOCK}

<h2>What we collect</h2>
<ul>
<li><strong>Account details:</strong> your name, email address and password (stored only as a secure hash, never in readable form). If you sign in with Google, we receive your name, email address and profile picture from Google.</li>
<li><strong>Profile details you choose to add:</strong> phone number, date of birth.</li>
<li><strong>Order and delivery details:</strong> the name, phone number and delivery address for each order, what you bought, and what you paid.</li>
<li><strong>Payment details:</strong> handled entirely by Razorpay. We never see or store your card number, CVV, UPI PIN or net-banking password — we only receive a payment reference and its status.</li>
<li><strong>Your activity on our shop:</strong> your bag, wishlist, reviews (and any photo you add to a review), and back-in-stock requests.</li>
<li><strong>Newsletter:</strong> your email address, if you subscribe.</li>
<li><strong>Location, only if you ask:</strong> if you tap "Use my current location" at checkout, your device's location is used once to fill in your city, state and pin code. We do not keep your location.</li>
<li><strong>Technical data:</strong> your IP address and browser details, used to keep the site secure (for example, to block repeated failed logins) and to find and fix errors.</li>
</ul>

<h2>Why we use it</h2>
<ul>
<li>To take, deliver and support your orders, and to issue GST invoices.</li>
<li>To run your account, wishlist and order history.</li>
<li>To send emails about your orders, password resets and account security.</li>
<li>To send our newsletter and back-in-stock alerts — only if you asked for them. Every newsletter has an unsubscribe link.</li>
<li>To keep the site secure, prevent fraud and fix problems.</li>
<li>To meet our legal obligations, such as tax and accounting records.</li>
</ul>
<p>We do not sell your personal data, and we do not use advertising or tracking cookies.</p>

<h2>Who we share it with</h2>
<p>Only with the service providers that help us run the shop, and only what each one needs:</p>
<ul>
<li><strong>Razorpay</strong> — to process payments and refunds.</li>
<li><strong>Shiprocket and its courier partners</strong> — your name, phone number and delivery address, to deliver your order.</li>
<li><strong>Resend</strong> — to send order and account emails.</li>
<li><strong>Google</strong> — if you choose "Sign in with Google", and to look up your pin code if you use your current location.</li>
<li><strong>Supabase and Vercel</strong> — to host our database and website. Your account and order data is stored in Mumbai, India.</li>
<li><strong>Cloudinary</strong> — to store and serve product and review images.</li>
<li><strong>Sentry and Upstash</strong> — error monitoring and security (rate limiting).</li>
</ul>
<p>Some of these providers may process data outside India, under contracts that require them to protect it. We may also share information when the law requires it, for example with tax authorities or in response to a lawful order.</p>

<h2>Cookies</h2>
<p>We use only the cookies the shop needs to work: to keep you signed in, remember your bag, and protect forms against misuse. We do not use advertising or analytics cookies.</p>

<h2>How long we keep it</h2>
<p>We keep your account details until you ask us to delete your account. Order and invoice records are kept for as long as Indian tax law requires (currently at least 8 years). Newsletter details are removed when you unsubscribe.</p>

<h2>Your rights</h2>
<p>You can ask us to:</p>
<ul>
<li>tell you what personal data we hold about you,</li>
<li>correct or update it (you can edit most of it yourself under <strong>Your account</strong>),</li>
<li>delete your account and personal data, except records we must keep by law,</li>
<li>withdraw consent to marketing emails at any time.</li>
</ul>
<p>You may also nominate someone to exercise these rights on your behalf. Email ${mail} and we'll respond within 30 days.</p>

<h2>Keeping it safe</h2>
<p>Our site runs only over encrypted HTTPS, passwords are stored as one-way hashes, and access to customer data is limited to the people who need it to fulfil your order.</p>

<h2>Children</h2>
<p>Our shop is meant for adults. If you are under 18, please shop with the involvement of a parent or guardian.</p>

<h2>Changes to this policy</h2>
<p>If we change this policy, we'll update the date at the top of this page. For significant changes we'll let account holders know by email.</p>

${GRIEVANCE_BLOCK}`,
  },

  // ── Terms ─────────────────────────────────────────────────────────────────
  {
    slug: "terms",
    title: "Terms & conditions",
    excerpt:
      "The terms that apply when you use www.mysilvers.in and buy jewellery from MY Silvers.",
    metaTitle: "Terms & Conditions",
    metaDescription:
      "Terms of use and sale for www.mysilvers.in — orders, pricing, payment, delivery, returns, and your rights when you buy silver jewellery from MY Silvers.",
    content: `
<p><em>Last updated: November 2026</em></p>
<p>These terms apply when you use www.mysilvers.in (the "site") or buy from us. By placing an order you agree to them. Please also read our ${link("/p/privacy", "Privacy policy")}, ${link("/p/shipping", "Shipping & delivery")} and ${link("/p/returns", "Returns & exchanges")} policies, which form part of these terms.</p>

<h2>1. About us</h2>
${BUSINESS_BLOCK}

<h2>2. Using the site</h2>
<ul>
<li>You must be 18 or older to place an order, or shop with the involvement of a parent or guardian.</li>
<li>Please give accurate details when you create an account or check out, and keep your password private. You are responsible for activity on your account.</li>
<li>Don't misuse the site — for example, by trying to break its security, scraping it, or placing fraudulent orders. We may suspend accounts that do.</li>
</ul>

<h2>3. Our products</h2>
<ul>
<li>Our jewellery is made in India in 925 sterling silver (92.5% pure silver), unless a product page says otherwise. Plated and oxidised finishes are described on each product page.</li>
<li>Many pieces are finished by hand, so small variations in size, weight, texture and colour from the photos are natural and are not defects.</li>
<li>Colours can look slightly different depending on your screen.</li>
<li>Silver tarnishes naturally over time; see our ${link("/p/care-guide", "Silver care guide")}.</li>
</ul>

<h2>4. Prices and payment</h2>
<ul>
<li>All prices are in Indian Rupees and include GST. The delivery charge, if any, is shown before you pay.</li>
<li>Payment is taken online through Razorpay (UPI, cards, net banking and wallets). Cash on Delivery is not available at present.</li>
<li>Discount codes are subject to the conditions shown with each offer, can't be exchanged for cash, and only one code can be used per order unless stated otherwise.</li>
<li>We send a GST invoice for every order.</li>
</ul>

<h2>5. Orders</h2>
<ul>
<li>Your order is confirmed once payment succeeds and you receive our confirmation email.</li>
<li>We may cancel an order if a piece goes out of stock, if there is an obvious pricing or listing error, or if we suspect fraud. If we cancel, we refund the full amount to your original payment method.</li>
<li>You can cancel your own order until it is dispatched — see ${link("/p/returns", "Returns & exchanges")}.</li>
</ul>

<h2>6. Delivery</h2>
<p>We deliver within India. Dispatch and delivery times are estimates, explained in our ${link("/p/shipping", "Shipping & delivery")} policy. Responsibility for the parcel passes to you on delivery.</p>

<h2>7. Returns, refunds and cancellations</h2>
<p>We accept claims for damaged, defective or wrong items reported within 48 hours of delivery with an unboxing video, and offer a refund or an exchange. We do not accept change-of-mind returns. The full policy is on our ${link("/p/returns", "Returns & exchanges")} page.</p>

<h2>8. Reviews and content you post</h2>
<p>When you post a review or photo, you confirm it is your own honest opinion and that you have the right to share it. You allow us to show it on the site and in our marketing. We may decline or remove reviews that are abusive, misleading or off-topic.</p>

<h2>9. Intellectual property</h2>
<p>The MY Silvers name, logo, product photos, designs and text on this site belong to us. Please don't copy or reuse them without our written permission.</p>

<h2>10. Our responsibility to you</h2>
<p>We take care to describe our products accurately and keep the site running, but we can't guarantee it will always be available or error-free. To the extent the law allows, our liability for any order is limited to the amount you paid for it. Nothing in these terms limits your rights under the Consumer Protection Act, 2019.</p>

<h2>11. Governing law</h2>
<p>These terms are governed by the laws of India. Any dispute will be subject to the jurisdiction of the courts at Tiruvannamalai, Tamil Nadu. This does not take away your right to approach a consumer commission where you live.</p>

<h2>12. Changes to these terms</h2>
<p>We may update these terms from time to time. The version on this page when you place an order is the one that applies to it.</p>

${GRIEVANCE_BLOCK}

<h2>Contact</h2>
<p>Questions about these terms? Email ${mail}.</p>`,
  },
  // ── Contact ───────────────────────────────────────────────────────────────
  // Added Nov 2026: the footer's "Contact us" opened "page not found" on live.
  // Phone/WhatsApp 94428 63756 is the number already public on the live site
  // (footer WhatsApp link, invoices). Hours and whether the Chengam address
  // takes walk-in visitors are NOT known — marked as gaps.
  {
    slug: "contact",
    title: "Contact us",
    excerpt: "Questions about an order, a piece or a gift? Write to us or message us on WhatsApp — we're happy to help.",
    metaTitle: "Contact Us",
    metaDescription:
      "Contact MY Silvers about your order, a piece or a gift — email support@mysilvers.in or message us on WhatsApp at +91 94428 63756.",
    content: `
<p>Whether it's a question about your order, a piece you have your eye on, or help choosing a gift — we're here.</p>

<h2>Write to us</h2>
<p>Email: ${mail}<br>
WhatsApp: <a href="https://wa.me/919442863756">+91 94428 63756</a></p>
<p>${gap("the hours you answer messages and calls, e.g. Monday–Saturday, 10 am – 7 pm")}</p>

<h2>About an order</h2>
<p>Please include your <strong>order number</strong> (it starts with MYS-) — it's in your confirmation email and under <strong>Your orders</strong>. It lets us find your order straight away.</p>
<ul>
<li>Where is my order? See ${link("/track-order", "Track your order")}.</li>
<li>Damaged or wrong item? Tell us within 48 hours — see ${link("/p/returns", "Returns & exchanges")}.</li>
<li>Delivery times and charges: ${link("/p/shipping", "Shipping & delivery")}.</li>
<li>Caring for your silver: ${link("/p/care-guide", "Silver care guide")}.</li>
</ul>

<h2>Our registered address</h2>
${BUSINESS_BLOCK}
<p>${gap("whether customers can visit this address to see pieces in person — if yes, the shop's opening hours; if not, say it is our office and orders are online only")}</p>
${GRIEVANCE_BLOCK}`,
  },

  // ── About ─────────────────────────────────────────────────────────────────
  // Added Nov 2026 for the footer's "Our story". Only confirmed facts: 925
  // sterling silver, made in India, packed by hand, from Chengam. The story
  // itself is the owner's to tell — marked as gaps, never invented.
  {
    slug: "about",
    title: "Our story",
    excerpt: "925 sterling silver jewellery, made in India and packed by hand in Chengam, Tamil Nadu.",
    metaTitle: "Our Story",
    metaDescription:
      "MY Silvers makes 925 sterling silver jewellery in India — designed to be worn every day, packed by hand in Chengam, Tamil Nadu.",
    content: `
<p>${gap("how MY Silvers began — who started it, when, and why (two or three sentences in your own words)")}</p>

<h2>What we make</h2>
<p>Every piece we sell is <strong>925 sterling silver</strong> and <strong>made in India</strong> — jewellery designed to be worn every day, not kept in a box for an occasion.</p>
<p>${gap("what makes your pieces special — the designs, the craftsmanship, the artisans or region they come from")}</p>

<h2>From Chengam, with care</h2>
<p>We are based in Chengam, in Tiruvannamalai District, Tamil Nadu. Every order is checked and <strong>packed by hand</strong> before it leaves us.</p>

<h2>Our promise</h2>
<ul>
<li>925 sterling silver, every piece.</li>
<li>Secure online payment through Razorpay.</li>
<li>Damaged or wrong item? We'll make it right — see ${link("/p/returns", "Returns & exchanges")}.</li>
</ul>

<p>Questions? We'd love to hear from you — ${link("/p/contact", "contact us")}.</p>`,
  },
];

async function main() {
  const type = await prisma.contentType.findUnique({ where: { name: "page" } });
  if (!type) throw new Error('Content type "page" not found — run `npm run db:seed` first.');

  for (const p of PAGES) {
    const data = {
      title: p.title,
      slug: p.slug,
      excerpt: p.excerpt,
      content: sanitizeRichText(p.content.trim()),
    };
    const seo = {
      seoMetaTitle: p.metaTitle,
      seoMetaDescription: p.metaDescription,
      seoNoIndex: false,
    };
    const gaps = (data.content.match(/To be added:/g) ?? []).length;
    const existing = await prisma.contentEntry.findUnique({
      where: { contentTypeId_slug: { contentTypeId: type.id, slug: p.slug } },
    });

    const note = `${p.slug.padEnd(11)} title ${p.metaTitle.length}ch, description ${p.metaDescription.length}ch, ${gaps} gap(s)`;
    if (existing && !FORCE) {
      console.log(`SKIP  ${note} — already exists (${existing.status}); pass --force to overwrite its draft`);
      continue;
    }
    if (VERIFY_ONLY) {
      console.log(`${existing ? "WOULD UPDATE" : "WOULD CREATE"} ${note}`);
      continue;
    }

    if (existing) {
      const last = await prisma.contentEntryVersion.findFirst({
        where: { entryId: existing.id },
        orderBy: { versionNumber: "desc" },
      });
      await prisma.$transaction([
        prisma.contentEntryVersion.create({
          data: {
            entryId: existing.id,
            versionNumber: (last?.versionNumber ?? 0) + 1,
            data: existing.data as object,
            status: existing.status,
            label: "before add-footer-pages --force",
          },
        }),
        prisma.contentEntry.update({ where: { id: existing.id }, data: { data, ...seo } }),
      ]);
      console.log(`UPDATED draft  ${note}`);
    } else {
      await prisma.contentEntry.create({
        data: { contentTypeId: type.id, slug: p.slug, status: "draft", data, ...seo },
      });
      console.log(`CREATED draft  ${note}`);
    }
  }
  console.log("\nNothing is published. Open CMS → Pages, read each draft, and press Publish.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
