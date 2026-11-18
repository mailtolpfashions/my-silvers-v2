# Testing MY Silvers

End-to-end tests use **Playwright**, in `e2e/`. They drive a real browser against a
production build of the shop (`next build` + `next start` on port 3100) and
check what landed in the database.

## The four layers

| Layer | Command | What it covers | Where it runs |
|---|---|---|---|
| **Smoke** | `npm run test:smoke` | ~30 must-pass checks: every main page loads, a product goes in the cart, a COD order places, admin/Studio open, gated pages are locked, cron/webhooks refuse strangers. Also runs on iPhone Safari (WebKit). | Local build + dev DB |
| **Live smoke** | `npm run test:smoke:live` (optional `-- <url>`) | The read-only subset tagged `@live-safe`: pages, catalogue, guest cart in the browser, gated redirects, robots/sitemap, broken images, FAQ placeholders, API locks. | **The live shop** (default https://www.mysilvers.in) |
| **Functional** | `npm run test:functional` | Every journey, desktop Chrome, without the performance budgets. | Local build + dev DB |
| **Regression** | `npm run test:regression` | Everything: functional + performance + SEO + security headers, on desktop, Android (Pixel 7) and iPhone smoke. | Local build + dev DB |

Before any of them: `npm run lint`, `npm run typecheck`, `npm run build`.
`npm run test:e2e:report` opens the HTML report of the last run (with a trace,
screenshot and video for every failure).

## Safety rules (enforced in code, not by convention)

1. **A local run refuses to start unless `.env` points at the DEV database**
   (`e2e/global-setup.ts`). The suite creates and deletes users, orders,
   products and coupons and flips store settings.
2. **A run against any real URL is read-only.** `playwright.config.ts` forces
   `--grep @live-safe`, and every DB helper throws (`e2e/helpers/target.ts`).
   The old instruction `E2E_BASE_URL=… npx playwright test` is now safe for
   the same reason.
3. **No email leaves a test run.** The test server sets `E2E_EMAIL_DRY_RUN=1`;
   `deliver()` in `src/server/email/resend.ts` returns before calling Resend.
4. **No money moves.** The repo's Razorpay keys are LIVE keys, so no test
   completes a payment. Payment behaviour is tested through signed webhooks
   (`payment-flow.spec.ts`, `payments-webhook.spec.ts`) and COD orders.
5. **Shiprocket is never called** (credentials blanked for the test server — it
   has no sandbox and locks the account after failed logins).
6. **Everything a test makes is named so it can be swept:** users `e2e-…`,
   products `e2e-…` / SKU `E2E-…`, coupons `E2E…`, CMS entries `e2e-…`,
   test orders `E2E-…` or `MYS-9xxxxxxxx`. `e2e/global-teardown.ts` removes
   leftovers after every run.

Check nothing was left behind: `node scripts/e2e-data-counts.mjs` before and
after a run (dev DB only; prints numbers, never credentials).

## Tags

- `@smoke` — in the smoke pack.
- `@live-safe` — read-only, browser-only, safe against real customers. A test
  with this tag must not import a DB helper call, sign in, or submit a form
  that writes.

## What the suite cannot test — check by hand before launch

- [ ] A real **online payment** with a real card (or switch dev to Razorpay
      *test* keys, then automate it): order becomes paid, stock drops, email
      arrives, invoice shows the GSTIN.
- [ ] A real **refund** from the admin.
- [ ] A real **Shiprocket / NimbusPost** booking and tracking update.
- [ ] **Emails actually arrive** (order confirmation, password reset) and are
      not in spam.
- [ ] **Google sign-in**.
- [ ] Photos upload to **Cloudinary** from the admin and from a review.

## Spec map

| Spec | Covers |
|---|---|
| `catalogue` | sort, price filter, empty state, search, categories, infinite scroll |
| `product` | add to cart, one-off (stock 1) limits, sold-out + notify me, archived, wishlist |
| `commerce` | store settings, COD order totals, gift wrap, coupons, checkout journey (stock taken & returned on cancel, double-click → one order, Indian phone/PIN validation), WhatsApp, header menu |
| `account` | profile, address book, order history + invoice, privacy of others' orders, return window, track order, newsletter |
| `payment-flow` | what signed Razorpay webhooks do to a real order row |
| `admin-catalog` | edit price/stock reaches the shop, negative price refused, archive/restore, who sees costs |
| `admin-orders` | staff cancel restores stock, return request → reject / approve |
| `cms` | editor writes + publishes a page, homepage guard rails, role boundaries |
| `api-guards` | every privileged API and cron refuses strangers; public APIs survive hostile input |
| `live-smoke` | the read-only pack for the live shop |
| others | access control, auth, roles, dashboard, owner tools, SEO, headers, performance budgets |
