import { prisma } from "@/server/db";
import { sendBackInStockEmail } from "@/server/email/resend";

/**
 * Back-in-stock alerts.
 *
 * An out-of-stock product page is otherwise a dead end: the shopper wanted this
 * exact piece, and the only thing on offer is leaving. Capturing the address
 * turns that into the shop's best demand signal — a list, per size, of people
 * who have already decided.
 */

/** Products with no sizes store the empty string, never null. See the model. */
function normaliseSize(size: string | null | undefined): string {
  return (size ?? "").trim();
}

/**
 * Registers an email against a product and size.
 *
 * Idempotent by construction: the unique index on (productId, size, email)
 * turns a second request into an update rather than a second row, so asking
 * twice cannot produce two emails.
 *
 * ⚠️  Re-asking CLEARS `notifiedAt`. Someone who was told last month, missed
 * it, and has come back to ask again is asking about the next restock — not
 * repeating the old request. Leaving the timestamp in place would silently
 * drop them from every future alert, and they would have no way to tell.
 */
export async function subscribeToStock(params: {
  productId: string;
  size?: string | null;
  email: string;
}): Promise<void> {
  const size = normaliseSize(params.size);
  const email = params.email.trim().toLowerCase();

  await prisma.stockNotification.upsert({
    where: { productId_size_email: { productId: params.productId, size, email } },
    update: { notifiedAt: null, createdAt: new Date() },
    create: { productId: params.productId, size, email },
  });
}

/** How many people are waiting on a product, across every size. */
export async function countWaiting(productId: string): Promise<number> {
  return prisma.stockNotification.count({
    where: { productId, notifiedAt: null },
  });
}

/**
 * Tells everyone waiting on these product/size pairs that it is back.
 *
 * ── Why the rows are claimed before a single email is sent ───────────────────
 * `notifiedAt` is stamped FIRST, in one UPDATE, and only then are the messages
 * sent. Done the other way round, two admins saving the same product at the
 * same moment — or one impatient double-click — would both read the same
 * pending rows and both send, and the customer gets the same alert twice.
 *
 * The trade is deliberate and one-directional: if the mail provider then fails,
 * someone is marked as told without having been told. That is a missed alert.
 * The alternative is a duplicate, and for a shop that has just come back into
 * stock, being emailed twice reads as careless in a way that silence does not.
 *
 * Never throws. This runs after an admin has already saved a product, and a
 * failing mail provider must not turn a successful save into an error on their
 * screen.
 */
export async function notifyBackInStock(
  restocked: Array<{ productId: string; size: string }>
): Promise<number> {
  if (restocked.length === 0) return 0;

  try {
    const pending = await prisma.stockNotification.findMany({
      where: {
        notifiedAt: null,
        OR: restocked.map((r) => ({ productId: r.productId, size: r.size })),
      },
      select: {
        id: true,
        email: true,
        size: true,
        product: { select: { name: true, slug: true } },
      },
    });
    if (pending.length === 0) return 0;

    // Claim them all before sending — see the note above.
    await prisma.stockNotification.updateMany({
      where: { id: { in: pending.map((p) => p.id) } },
      data: { notifiedAt: new Date() },
    });

    // Sequential rather than Promise.all: this is a background pass with no one
    // waiting on it, and a burst of parallel sends is how a shared mail account
    // gets rate-limited into dropping the rest.
    let sent = 0;
    for (const row of pending) {
      try {
        await sendBackInStockEmail({
          to: row.email,
          productName: row.product.name,
          productSlug: row.product.slug,
          size: row.size || undefined,
        });
        sent += 1;
      } catch (err) {
        // One bad address must not stop the rest of the list.
        console.error(`[stock-alert] send failed for ${row.email}`, err);
      }
    }
    return sent;
  } catch (err) {
    console.error("notifyBackInStock failed", err);
    return 0;
  }
}
