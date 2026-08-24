# Going live

The steps to take MY Silvers from the development project to a real shop taking
real money, in the order they have to happen.

Written during the production-readiness audit (Aug 2026). Every trap listed here
is one that exists in this codebase specifically — not general advice.

---

## 0. Before you start

Have these ready. Missing any one of them stops the launch halfway.

- [ ] A **new Supabase project** for production. The current one is development:
      it holds ~120 demo products pointing at `placehold.co`, plus whatever the
      test suite has created. It is not the shop.
- [ ] **Razorpay live keys** — Key ID, Key Secret, and a *separate* webhook
      secret. All three, not two.
- [ ] **Shiprocket account, unlocked** (see §4 — this is currently blocking).
- [ ] The **real invoice details**: legal name, registered address, GSTIN,
      state code. Without them every invoice you issue is legally invalid (§3).
- [ ] An **Upstash Redis** database. Without it the live shop refuses logins
      and checkouts by design (§3).
- [ ] The domain, with DNS you can change.

---

## 1. The production database

### 1.1 Create the project

Create the new Supabase project. Note **both** connection strings — they are
different and both are needed:

| Variable       | Which string          | Why                                                |
| -------------- | --------------------- | -------------------------------------------------- |
| `DATABASE_URL` | Transaction pooler, port **6543** | The app runs serverless; every instance needs pooling. |
| `DIRECT_URL`   | Direct connection, port **5432**  | Prisma Migrate needs session-level advisory locks, which pgbouncer's transaction mode does not support. |

Getting these the wrong way round fails in two different confusing ways:
migrations hang forever, or the app exhausts connection slots under load.

### 1.2 Apply the schema

> **⚠️ Never run `prisma migrate dev` against this project.**
> It would drop the generated `searchVector` column on `Product`, taking
> full-text search with it. Every migration in `prisma/migrations/` is
> hand-written for this reason — see the note in `schema.prisma`.

```bash
DIRECT_URL="<direct connection string>" npx prisma migrate deploy
```

Then confirm the two things migrations alone do not guarantee:

```sql
-- Full-text search index must exist.
SELECT indexname FROM pg_indexes
 WHERE tablename = 'Product' AND indexname = 'product_search_idx';

-- The generated column must exist and be populated.
SELECT count(*) FROM "Product" WHERE "searchVector" IS NOT NULL;
```

### 1.3 Seed the structure, not the demo content

```bash
npm run db:seed          # content types + categories. Required.
```

Do **not** run `db:seed:demo`. That is the 120-product placeholder catalogue.

### 1.4 Create the first admin

```bash
npm run admin:create -- you@yourdomain.com
```

Prints a random password once. Use that form rather than passing a password as
an argument, which leaves it in your shell history.

---

## 2. Content before launch

- [ ] Rewrite every FAQ answer. The seeded ones are prefixed
      `"Sample answer —"` and will go live verbatim otherwise.
- [ ] Publish real hero slides. **Keep the video under control** — an
      untransformed Cloudinary upload is served at its original size, which is
      how the homepage came to be 12.8 MB. Delivery URLs are transformed
      automatically now (`src/lib/cloudinary-video.ts`), but a 4K master still
      costs storage and transcode time.
- [ ] Real products with real images and **cost prices**. Products without a
      `costPrice` are excluded from margin figures rather than counted as free,
      so the finance page silently overstates profit until they are filled in.

---

## 3. Environment variables

Set every one of these in Vercel → Settings → Environment Variables, scoped to
**Production**.

### The five that will bite you

1. **`RAZORPAY_KEY_ID` and `NEXT_PUBLIC_RAZORPAY_KEY_ID` must match.**
   They are the same value in two places — one for the server, one shipped to
   the browser. Switching only one to live keys means Checkout opens against
   one account and verification runs against another. Every payment fails, and
   the error does not say why.

2. **`UPSTASH_REDIS_REST_URL` / `_TOKEN` are not optional in production.**
   The limiter fails *closed* when they are missing or still placeholders: the
   shop refuses logins, checkouts and payment verification. This is deliberate
   (a typo'd variable must not silently unprotect the shop) but it means an
   incomplete deploy is a broken shop rather than an insecure one.
   `RATE_LIMIT_FAIL_OPEN` exists only for the test runner. Never set it here.

3. **`INVOICE_*` — all eight.** Missing values render as visible blanks rather
   than failing, so an unset `INVOICE_GSTIN` produces a GST invoice with no
   GSTIN, issued to every customer. That is a compliance problem, not a
   cosmetic one.

4. **`CRON_SECRET`** must be set and must match what Vercel Cron sends. The
   auto-refund sweep issues real refunds; the secret is all that stands between
   that endpoint and the internet.

5. **`ALLOW_PLACEHOLDER_IMAGES` must be UNSET.** Setting it to `1` lets
   `next/image` load `placehold.co`. That is for demo deployments only.

### Full checklist

Database: `DATABASE_URL`, `DIRECT_URL`
Auth: `AUTH_SECRET` (fresh, not reused from dev), `AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
Payments: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`
Media: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`
Email: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
Rate limiting: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
Shipping: `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_PICKUP_LOCATION`, `SHIPROCKET_PICKUP_PINCODE`, `SHIPROCKET_WEBHOOK_TOKEN`
Invoice: `INVOICE_LEGAL_NAME`, `INVOICE_ADDRESS`, `INVOICE_GSTIN`, `INVOICE_STATE`, `INVOICE_STATE_CODE`, `INVOICE_EMAIL`, `INVOICE_PHONE`, `INVOICE_HSN_CODE`
Cron: `CRON_SECRET`
App: `APP_BASE_URL`
Monitoring: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`
Social: `NEXT_PUBLIC_INSTAGRAM_URL`, `NEXT_PUBLIC_FACEBOOK_URL`, `NEXT_PUBLIC_YOUTUBE_URL`, `NEXT_PUBLIC_WHATSAPP_NUMBER`
Optional: `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ACCOUNT_ID`

Generate a **new** `AUTH_SECRET` for production. Reusing the development one
means a session cookie minted in dev is valid on the live shop.

---

## 4. Third-party services

### Shiprocket — read this before touching it

**There is no sandbox.** These credentials are the live account and every call
made with them is real. The integration is split into two steps precisely
because of the billing boundary:

- Creating an order costs **nothing** and can be cancelled freely. This is the
  test path.
- Assigning an AWB **costs money** and puts the shipment into the courier's
  system.

Do not recombine those steps. Testing the integration would then mean buying a
real waybill every time.

**The account locks after repeated failed logins, and the lock defeats the
correct password too.** It is currently locked — this happened once already,
when a dev server started before `.env` was filled in and each retry spent
another attempt. To recover:

1. Ask Shiprocket support to lift the block. Do this *first*.
2. Only then correct `SHIPROCKET_PASSWORD`.
3. Do not retry in between. Each attempt can extend the lock.

Also set, in the Shiprocket dashboard:
- Settings → Pickup Addresses: the nickname must match
  `SHIPROCKET_PICKUP_LOCATION` **exactly**. A mismatch fails every order
  creation with a message that never mentions the nickname.
- Settings → API → Webhooks: point at
  `https://<domain>/api/webhooks/shiprocket` with `SHIPROCKET_WEBHOOK_TOKEN`.

### Razorpay

- Switch the dashboard to **Live mode** and generate live keys.
- Webhook → `https://<domain>/api/webhooks/razorpay`, subscribed to
  `payment.captured`, `payment.authorized`, `payment.failed`.
- The webhook secret is **separate** from the key secret. Two different values.
- Verify the webhook fires before you rely on it: an order that captures but
  never fulfils is the failure mode this endpoint exists to prevent.

### Resend

- Verify the sending domain (SPF + DKIM). An unverified domain means order
  confirmations land in spam or bounce silently.
- `RESEND_FROM_EMAIL` must be on the verified domain.

### Google OAuth

- Add `https://<domain>/api/auth/callback/google` to the authorised redirect
  URIs. Sign-in fails with a Google-side error otherwise.

### Sentry

- `SENTRY_AUTH_TOKEN` enables source-map upload, which is what turns a stack
  trace into something readable. Without it errors still arrive, unreadably.

---

## 5. Deploy

- [ ] Point the Vercel project at the production branch.
- [ ] Confirm the build command is `prisma generate && next build`.
- [ ] Set the custom domain and let the certificate issue.
- [ ] Confirm the cron in `vercel.json` registered:
      `/api/cron/auto-refund-sweep` daily at 03:00 UTC.

> On Vercel **Hobby**, a cron may not run more than once a day — that is why
> the refund sweep is daily rather than every six hours. The cost is latency,
> not correctness: a captured-but-unfulfilled payment waits up to 24h for its
> refund instead of 6h. On Pro, put it back to `0 */6 * * *`.

---

## 6. Verify before announcing

Run the suite against the deployed site:

```bash
E2E_BASE_URL="https://<domain>" npx playwright test
```

Then, by hand, the things the suite cannot do:

- [ ] **A real payment.** Buy something cheap with a real card. Confirm: the
      order appears in `/admin/orders`, `paymentStatus` is `paid`, the
      confirmation email arrives, and the invoice shows your GSTIN.
- [ ] **A real refund** on that order, from `/admin/orders/<id>`. Confirm the
      money returns and `refundStatus` settles.
- [ ] **A Shiprocket order** created but AWB *not* assigned — the free half.
- [ ] Google sign-in, on the live domain.
- [ ] The homepage on a phone, on mobile data, not office wifi.

---

## 7. If it goes wrong

**Roll back the code**: Vercel → Deployments → the previous one → Promote to
Production. Takes about a minute.

**The database does not roll back with it.** Migrations are forward-only here.
If a migration is the problem, you need a corrective migration, not a revert.
Take a Supabase backup before §1.2 and know how to restore it.

**Turn the shop down without deploying**: `/admin/settings` can disable COD and
guest checkout immediately — both invalidate their cache on save. There is no
"close the shop" switch; if you need one, that is a feature to add, not a
setting that exists.

---

## 8. The first week

Watch, in this order of usefulness:

1. **Sentry** — anything from `create-order.ts`, `fulfill-order.ts` or either
   webhook route is money-related and urgent.
2. **Orders stuck at `paymentStatus: pending`** for more than an hour. The
   daily sweep will catch them, but a pattern means the webhook is not firing.
3. **`[rate-limit]` lines in the Vercel logs.** "Upstash not configured in
   PRODUCTION" means the shop is refusing logins right now.
4. **Supabase connection count.** This is the ceiling, and it has now been
   measured — see below.

---

## 9. What it will actually take

Measured against the demo deployment (audit Phase 5, Aug 2026) with
`scripts/loadtest.ts`. Re-run it after the catalogue grows or the plan changes:

```bash
npx tsx scripts/loadtest.ts https://www.mysilvers.in
```

> GET only — it never signs in, orders, or writes. Safe against production,
> though it will make the site slower while it runs.

**The ceiling is the pooler, at 200 client connections.** Pushed hard enough,
Postgres says so itself: `(EMAXCONN) max client connections reached, limit: 200`.
The stack is app instances → pgbouncer (200 client slots) → Postgres
(`max_connections = 60`). At `max: 5` per instance that is roughly **40
concurrent serverless instances**.

Raising it is a Supabase plan change, not a code change. Do not raise the pool
size in `db.ts` to compensate — a larger pool takes more slots from the same
budget for no extra throughput.

**What held:**

| Concurrent requests | Homepage (PPR shell) | `/products` (db) |
| --- | --- | --- |
| 40 | 1,010ms p95, 0 errors | 4,224ms p95, 0 errors |
| 220 | — | 0 errors |

`/products` absorbed 220 concurrent requests without a single failure. Rising
p95 against a flat error rate is queueing, which is the polite failure mode.

**Roughly**, a browsing shopper makes one request every 5–10 seconds, so 40 in
flight is on the order of **200–400 people browsing at once**. That last step is
arithmetic on top of the measurement, not a second measurement — treat the error
rates as fact and the shopper count as the right order of magnitude.

**Two operational notes:**

- A load-test run holds those 200 slots for a few minutes afterwards, and
  `next build` needs its own connections. A build started immediately after a
  run fails with the same `EMAXCONN`. Wait a few minutes.
- `/api/search/suggestions` used to be the first thing to break — 500s from 60
  concurrent. It is edge-cached now. If you ever remove those cache headers,
  this is what comes back.

---

## 10. Function region — the largest single performance lever

`vercel.json` pins functions to **`bom1` (Mumbai)** to sit beside Supabase's
`ap-south-1`. Keep the two in the same region; nothing else on this list moves
the needle as far.

Measured before the pin (audit, Aug 2026). Functions were running in `iad1`
(Washington DC) while the database was in Mumbai, so every query crossed the
planet and came back:

| Request | Deployed (`iad1`) | Local (63ms RTT) |
| --- | --- | --- |
| Search suggestions, cache miss | **~500 ms** | ~65 ms |
| Same, cold function | ~3.0 s | — |
| Same, edge cache hit | ~130 ms | — |

A page making four sequential queries was spending roughly two seconds doing
nothing but waiting for the network. The static shell hid most of it — PPR
serves that from the edge in ~28ms — but everything personal, and every cache
miss, paid it in full.

**Check it after any deploy.** The response header says where the function ran:

```bash
curl -sI https://www.mysilvers.in/ | grep -i x-vercel-id
# X-Vercel-Id: bom1::iad1::…
#              ^edge  ^function region — this one must be bom1
```

Two caveats:

- Region pinning for a single region works on Hobby; multiple regions need a
  paid plan. If a deploy ignores this, check the plan before assuming the
  config is wrong.
- If the database ever moves, this moves with it. A `bom1` function against a
  US database is exactly the problem above, in reverse.

### Judge speed on a production build, never `next dev`

Measured on one machine, same database, warm:

| Page | `next dev` | `next build && next start` |
| --- | --- | --- |
| `/` | 347 ms | **4 ms** |
| `/products` | 183 ms | **4 ms** |
| `/collections` | 124 ms | **4 ms** |

Dev compiles routes on demand and skips the production cache entirely. It is
30–85× slower here and says nothing about what ships.
