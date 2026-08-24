# MY Silvers

Storefront, admin and CMS for a hallmarked 925 sterling silver jewellery shop.
Next.js 16 (App Router, Partial Prerendering), Prisma 7 on Supabase Postgres,
Razorpay for payments, Shiprocket for courier, Cloudinary for media.

> **Read `AGENTS.md` first if you are working on this with an AI assistant.**
> This is Next 16 — APIs, file conventions and config differ from what most
> models were trained on. `node_modules/next/dist/docs/` is the source of truth.

---

## Getting started

```bash
npm install
cp .env.example .env      # then fill it in — every section has notes
npm run dev
```

`.env.example` is documentation, not a template to skim. It records which
values are traps (Razorpay's key ID appears twice; Shiprocket has no sandbox;
missing invoice fields render as blanks rather than erroring).

### Demo data

```bash
npm run db:seed           # content types + categories. Required.
npm run db:seed:demo      # ~120 placeholder products. Development only.
npm run admin:create -- you@example.com
```

`db:seed:demo` points products at `placehold.co`. `next/image` only loads that
host when `ALLOW_PLACEHOLDER_IMAGES=1` or outside production — see the note at
the top of `next.config.ts`.

---

## Tests

```bash
npm run test:e2e          # full suite
npm run test:e2e:ui       # interactive
npm run test:e2e:report   # last HTML report
```

Playwright runs against a **production build** (`next build` + `next start`),
deliberately: the security headers, the PPR shell and the rate limiter's
fail-closed branch only exist there, so a dev-server suite would pass while
saying nothing about what ships.

The suite needs `DATABASE_URL` pointing at the same database the server under
test uses — it creates and deletes its own users and orders. To run against a
deployed preview instead of a local server:

```bash
E2E_BASE_URL="https://<preview>.vercel.app" npx playwright test
```

Two suites are chromium-only. `commerce.spec.ts` writes the single-row
`StoreSetting` table, which is global to the whole app; running it in two
projects at once means two suites fighting over one resource.

---

## Architecture notes

**Partial Prerendering is on** (`cacheComponents` in `next.config.ts`). A
static shell is served from the edge with per-shopper holes streamed in. This
is why anonymous browsing is cheap and why a few things are shaped oddly — the
auth gate lives behind Suspense in a child rather than in the layout body, and
a missing product answers HTTP 200 with a `noindex` tag rather than a 404
(the status is committed before the dynamic hole resolves).

**Authorization is layered, and the role is never read from the token.**
`proxy.ts` (Next 16's renamed middleware) pre-filters on the cookie without
touching the database. Everything that decides what may be *done* calls
`getCurrentRole()` in `src/server/auth/require-role.ts`, which re-reads the
row — because `token.role` is written once at sign-in and never refreshes, so
trusting it means a revoked admin keeps their access until the session expires.

**Money is recomputed server-side, always.** `create-order.ts` derives
subtotal, shipping and total from database prices and ignores anything the
browser sends. Both Razorpay verification paths (client callback and webhook)
check an HMAC with `timingSafeEqual`, and the webhook reads the raw body —
re-serialized JSON would never match.

**Migrations are hand-written.** `prisma migrate dev` would drop the generated
`searchVector` column on `Product`. Write the SQL yourself and apply with
`prisma migrate deploy`. See the note in `prisma/schema.prisma`.

**Rate limiting fails closed in production.** Missing Upstash config makes the
shop refuse logins and checkouts rather than run unprotected. `RATE_LIMIT_FAIL_OPEN=1`
is the deliberate escape hatch, used only by the test runner.

---

## Going live

See **[docs/LAUNCH.md](docs/LAUNCH.md)** — the ordered runbook, the environment
variables that will bite you, and what to watch in the first week.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | `prisma generate && next build` |
| `npm run lint` | ESLint |
| `npm run test:e2e` | Playwright suite |
| `npm run db:seed` | Content types and categories |
| `npm run db:seed:demo` | Demo catalogue (development only) |
| `npm run db:clear:demo` | Remove demo data |
| `npm run admin:create` | Create or promote an admin/editor |
