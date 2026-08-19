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
   */
  idleTimeoutMillis: 10_000,

  /**
   * TCP keepalives on the sockets we are actively holding, so an idle-but-in-use
   * connection is not silently reaped by something between here and Supabase.
   */
  keepAlive: true,
} as const;

/**
 * The client, and the adapter, cached together across HMR.
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
