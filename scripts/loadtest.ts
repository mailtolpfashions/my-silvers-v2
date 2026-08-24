/**
 * A small, deliberately polite load test.
 *
 * Written for audit Phase 5: the question "how much traffic will this handle"
 * cannot be answered by reading code, and every answer offered without
 * measuring is a guess. This measures.
 *
 * ── What it does and does not do ─────────────────────────────────────────────
 * GET only. It never places an order, never signs in, never writes anything.
 * A load test that mutates state is a destructive test wearing a disguise, and
 * this is pointed at a deployment sharing a database with real data.
 *
 * It ramps concurrency in steps rather than dumping a fixed number of virtual
 * users, because the interesting figure is not "can it serve N" but "at which
 * N does it stop behaving". It aborts a step early if errors pass a threshold,
 * so finding the ceiling does not mean sitting on top of it.
 *
 * ── Reading the output ───────────────────────────────────────────────────────
 * p95 matters more than mean: the mean hides the shopper who waited eight
 * seconds. A rising p95 with a flat error rate means queueing (connections,
 * usually). Errors arriving before latency climbs means something is refusing
 * rather than queueing — a rate limit, or a pool that has given up.
 *
 *   npx tsx scripts/loadtest.ts https://example.vercel.app
 *
 * ── What it found, Aug 2026 ──────────────────────────────────────────────────
 * Against the demo deployment: /products absorbed 220 concurrent requests with
 * zero errors, and the PPR homepage barely moved. /api/search/suggestions began
 * returning 500s at 60 concurrent and failed 53% at 100 — it held two pooled
 * connections per request against a pool of five. Fixed by caching it at the
 * edge; see the route.
 *
 * Pushed further, the pooler names the real ceiling itself:
 * `(EMAXCONN) max client connections reached, limit: 200`. That is Supabase
 * pgbouncer accepting 200 clients in front of a Postgres with max_connections
 * = 60. At 5 connections per instance that is roughly 40 concurrent serverless
 * instances.
 *
 * ⚠️  Running this exhausts those 200 slots for a few minutes afterwards, and
 * `next build` needs its own connections — so a build started immediately
 * after a run fails with the same EMAXCONN. Wait, or expect it.
 */

const BASE = process.argv[2];
if (!BASE) {
  console.error("usage: npx tsx scripts/loadtest.ts <base-url>");
  process.exit(1);
}

/**
 * Three shapes of request, because they exercise different limits.
 *
 * The static shell should be served from the edge and barely touch the origin.
 * The listing and the suggestions endpoint both reach Postgres, which is where
 * `db.ts`'s pool of 5 per instance becomes the thing that binds.
 */
const ROUTES = [
  { path: "/", label: "homepage (PPR shell)" },
  { path: "/products", label: "listing (db)" },
  { path: "/api/search/suggestions?q=silver", label: "search api (db)" },
];

const STEPS = [2, 5, 10, 20, 40, 60, 100];
const REQUESTS_PER_STEP = 100;
const ABORT_ERROR_RATE = 0.25;

type Result = { ms: number; status: number; ok: boolean };

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[i];
}

async function once(url: string): Promise<Result> {
  const started = performance.now();
  try {
    // No-store so we measure the origin rather than a CDN hit we already have.
    const response = await fetch(url, {
      headers: { "cache-control": "no-cache", "user-agent": "mysilvers-audit-loadtest" },
    });
    // Drain the body — TTFB alone would flatter a streamed response.
    await response.arrayBuffer();
    return { ms: performance.now() - started, status: response.status, ok: response.ok };
  } catch {
    return { ms: performance.now() - started, status: 0, ok: false };
  }
}

/** Runs `total` requests with at most `concurrency` in flight. */
async function step(url: string, concurrency: number, total: number): Promise<Result[]> {
  const results: Result[] = [];
  let issued = 0;
  let aborted = false;

  async function worker() {
    while (issued < total && !aborted) {
      issued++;
      const r = await once(url);
      results.push(r);

      // Bail out of a step that is clearly past the edge, rather than
      // hammering something already failing.
      if (results.length >= 20) {
        const errorRate = results.filter((x) => !x.ok).length / results.length;
        if (errorRate > ABORT_ERROR_RATE) aborted = true;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

function summarise(results: Result[]) {
  const sorted = results.map((r) => r.ms).sort((a, b) => a - b);
  const errors = results.filter((r) => !r.ok);
  const byStatus = new Map<number, number>();
  for (const r of results) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);

  return {
    n: results.length,
    p50: Math.round(percentile(sorted, 50)),
    p95: Math.round(percentile(sorted, 95)),
    max: Math.round(sorted[sorted.length - 1] ?? 0),
    errorRate: results.length ? errors.length / results.length : 0,
    statuses: [...byStatus.entries()].map(([s, n]) => `${s}×${n}`).join(" "),
  };
}

(async () => {
  console.log(`\nTarget: ${BASE}`);
  console.log(`GET only — nothing is created, signed in to, or written.\n`);

  for (const route of ROUTES) {
    const url = `${BASE}${route.path}`;
    console.log(`── ${route.label}  ${route.path}`);
    console.log(`   ${"conc".padStart(5)} ${"n".padStart(5)} ${"p50".padStart(7)} ${"p95".padStart(7)} ${"max".padStart(7)}  err   statuses`);

    for (const concurrency of STEPS) {
      const results = await step(url, concurrency, REQUESTS_PER_STEP);
      const s = summarise(results);
      const err = `${Math.round(s.errorRate * 100)}%`;

      console.log(
        `   ${String(concurrency).padStart(5)} ${String(s.n).padStart(5)} ` +
          `${(s.p50 + "ms").padStart(7)} ${(s.p95 + "ms").padStart(7)} ${(s.max + "ms").padStart(7)}  ` +
          `${err.padStart(4)}  ${s.statuses}`
      );

      if (s.errorRate > ABORT_ERROR_RATE) {
        console.log(`   ↳ stopping this route: error rate past ${ABORT_ERROR_RATE * 100}%`);
        break;
      }

      // Breathe between steps so one step's queue does not become the next
      // step's starting condition.
      await new Promise((r) => setTimeout(r, 2000));
    }
    console.log();
  }
})();
