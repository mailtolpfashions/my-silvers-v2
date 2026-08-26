import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Connection pool settings for the app's runtime connection.
 *
 * ⚠️  These are not tuning. Without them a dev server that has been open for a
 * few hours starts failing every query with `P1001 DatabaseNotReachable`, while
 * the very same queries run fine from a fresh process against the same URL —
 * so it reads like the database is down when nothing is wrong with it.
 *
 * DATABASE_URL points at Supabase's pgbouncer transaction pooler (port 6543).
 * pgbouncer multiplexes, so a large client-side pool buys nothing and costs
 * real connection slots — and the free tier has few of them to give.
 */
const POOL = {
  /**
   * Small on purpose. Every process gets its own pool: dev servers, each
   * serverless instance in production, background jobs. pgbouncer is doing the
   * real pooling behind this, so ten idle sockets per process is ten slots
   * taken from the shared budget for no throughput.
   */
  max: 5,

  /**
   * ⚠️  The single most important line here. `pg` defaults this to 0, meaning
   * "wait forever" — which is how a homepage render took 22.9 seconds and then
   * failed anyway. A connection that has not been established in eight seconds
   * is not coming; fail fast, surface the error, and let the next request try a
   * fresh socket.
   */
  connectionTimeoutMillis: 8_000,

  /**
   * Drop our own idle connections before the far end does. A socket the pooler
   * has already closed still looks alive in the local pool, and the query that
   * draws it is the one that fails.
   *
   * ⚠️  Was 10 seconds, which made this line the CAUSE of reconnections rather
   * than the cure for them. Any quiet stretch longer than ten seconds — which
   * is most of them, on a dev server or a shop between customers — emptied the
   * pool, so the next page view paid for a fresh DNS lookup, TCP handshake, TLS
   * negotiation and pgbouncer auth.
   *
   * That matters because `aws-1-ap-south-1.pooler.supabase.com` round-robins
   * across three addresses on a ~30 second TTL, and a window occasionally
   * appears where new connections hang for the full eight-second timeout before
   * clearing on their own. A pool that keeps its sockets sails through such a
   * window; a pool that rebuilds itself every fifteen seconds walks into it.
   *
   * Measured, same eight rounds of six queries with fifteen-second gaps:
   *
   *   idleTimeoutMillis: 10_000  →  35 new connections,  6 of 48 queries failed
   *   idleTimeoutMillis: 60_000  →   5 new connections,  0 of 48 queries failed
   *
   * Sixty seconds is still far under pgbouncer's own 600s server_idle_timeout,
   * so the far end is not going to close these underneath us.
   */
  idleTimeoutMillis: 60_000,

  /**
   * TCP keepalives on the sockets we are actively holding, so an idle-but-in-use
   * connection is not silently reaped by something between here and Supabase.
   */
  keepAlive: true,

  /**
   * When the first keepalive probe actually goes out.
   *
   * Without it Node leaves the delay to the operating system, and Windows
   * defaults to two hours — so a socket killed by a NAT or a dropped wifi link
   * is never noticed by the keepalive whose entire job is to notice it. Now
   * that connections are held for a minute instead of ten seconds, this is what
   * makes `keepAlive` above mean anything.
   */
  keepAliveInitialDelayMillis: 10_000,
} as const;

/**
 * The client, and the adapter, cached together across HMR.
 *
 * ⚠️  RESTART THE DEV SERVER AFTER `prisma generate`. The cached instance is
 * built from the generated client as it was when the process started, and
 * nothing invalidates it — Fast Refresh reloads the module but `globalThis`
 * keeps the old object. The symptom is a delegate for a brand new model coming
 * back `undefined` ("Cannot read properties of undefined (reading 'aggregate')")
 * while `tsc` is perfectly happy, because tsc reads the new types off disk.
 *
 * Both, deliberately. The adapter used to be constructed at module scope on
 * every evaluation, so each Fast Refresh built a fresh `pg.Pool` while the
 * cached client kept the original — harmless in isolation, since pools are
 * lazy, but it meant the thing holding the sockets was not the thing being
 * cached. Keeping them as one pair makes the singleton mean what it says.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, ...POOL }),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
