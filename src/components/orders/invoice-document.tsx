import { formatINRPaise } from "@/lib/format";
import type { Invoice } from "@/server/orders/invoice";

/**
 * The tax invoice itself, as a printable page.
 *
 * ── Print, not PDF ───────────────────────────────────────────────────────────
 * No PDF library. `window.print()` on a page with print styles gives the
 * customer a PDF anyway — every browser's print dialogue offers "Save as PDF" —
 * and it does so without shipping a rendering engine to the client or running a
 * headless browser on the server. It also stays selectable, searchable and
 * translatable, which a canvas-drawn PDF does not.
 *
 * The layout is deliberately plain. An invoice is a document someone may have
 * to hand to an accountant or attach to a return; the storefront's editorial
 * styling would be noise on it, and print CSS has to survive being rendered by
 * whatever the customer's browser does at A4.
 */
export function InvoiceDocument({ invoice }: { invoice: Invoice }) {
  const {
    seller,
    buyer,
    lines,
    intraState,
    ratePercent,
    cgstPaise,
    sgstPaise,
    igstPaise,
  } = invoice;

  return (
    <article className="mx-auto max-w-3xl bg-white p-8 text-sm text-black print:p-0">
      <header className="flex items-start justify-between border-b border-black/20 pb-6">
        <div>
          <h1 className="text-lg font-medium tracking-wide">TAX INVOICE</h1>
          <p className="mt-1 text-xs text-black/60">
            {invoice.number} · {invoice.issuedAt.toLocaleDateString("en-IN", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="text-right">
          <p className="font-medium">{seller.legalName}</p>
          {seller.address && (
            <p className="mt-1 max-w-[16rem] whitespace-pre-line text-xs text-black/70">
              {seller.address}
            </p>
          )}
          {/* Shown as a visible blank rather than hidden when unset — an empty
              GSTIN on a rendered invoice gets noticed; a missing line does not. */}
          <p className="mt-1 text-xs text-black/70">
            GSTIN: {seller.gstin || <span className="text-red-600">not configured</span>}
          </p>
          {seller.stateCode && (
            <p className="text-xs text-black/70">
              State: {seller.state} ({seller.stateCode})
            </p>
          )}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-8 border-b border-black/20 py-6">
        <div>
          <h2 className="mb-2 text-xs uppercase tracking-wider text-black/50">Billed to</h2>
          <p className="font-medium">{buyer.name}</p>
          {buyer.address.map((line) => (
            <p key={line} className="text-black/70">
              {line}
            </p>
          ))}
          <p className="text-black/70">
            {buyer.state} {buyer.pincode}
          </p>
          {buyer.phone && <p className="text-black/70">{buyer.phone}</p>}
          <p className="text-black/70">{buyer.email}</p>
        </div>
        <div className="text-right">
          <h2 className="mb-2 text-xs uppercase tracking-wider text-black/50">Order</h2>
          <p>{invoice.orderNumber}</p>
          <p className="text-black/70">
            {invoice.orderedAt.toLocaleDateString("en-IN", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
          <p className="mt-2 text-black/70">{invoice.paymentMethod}</p>
          <p className="text-black/70">
            Place of supply: {buyer.state || "—"}
          </p>
        </div>
      </section>

      <table className="w-full border-collapse py-6 text-left">
        <thead>
          <tr className="border-b border-black/20 text-xs uppercase tracking-wider text-black/50">
            <th className="py-2 font-normal">Item</th>
            <th className="py-2 font-normal">HSN</th>
            <th className="py-2 text-right font-normal">Qty</th>
            <th className="py-2 text-right font-normal">Rate</th>
            <th className="py-2 text-right font-normal">Taxable</th>
            <th className="py-2 text-right font-normal">GST</th>
            <th className="py-2 text-right font-normal">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <tr key={`${line.name}-${i}`} className="border-b border-black/10 align-top">
              <td className="py-2.5 pr-3">
                {line.name}
                {line.size && <span className="text-black/50"> · {line.size}</span>}
              </td>
              <td className="py-2.5 text-black/70">{line.hsn}</td>
              <td className="py-2.5 text-right">{line.quantity}</td>
              <td className="py-2.5 text-right">{formatINRPaise(line.unitPaise)}</td>
              <td className="py-2.5 text-right">{formatINRPaise(line.taxablePaise)}</td>
              <td className="py-2.5 text-right">{formatINRPaise(line.taxPaise)}</td>
              <td className="py-2.5 text-right">{formatINRPaise(line.grossPaise)}</td>
            </tr>
          ))}
          {invoice.shippingGrossPaise > 0 && (
            <tr className="border-b border-black/10">
              <td className="py-2.5 pr-3" colSpan={4}>
                Shipping
              </td>
              <td className="py-2.5 text-right">
                {formatINRPaise(invoice.shippingTaxablePaise)}
              </td>
              <td className="py-2.5 text-right">{formatINRPaise(invoice.shippingTaxPaise)}</td>
              <td className="py-2.5 text-right">{formatINRPaise(invoice.shippingGrossPaise)}</td>
            </tr>
          )}
          {/* Its own line, not folded into shipping. A customer checking the
              invoice against what was taken from their card has to be able to
              find every rupee of it, and a charge that appears only inside a
              larger number is a charge they cannot account for. */}
          {invoice.giftWrapGrossPaise > 0 && (
            <tr className="border-b border-black/10">
              <td className="py-2.5 pr-3" colSpan={4}>
                Gift wrap
              </td>
              <td className="py-2.5 text-right">
                {formatINRPaise(invoice.giftWrapTaxablePaise)}
              </td>
              <td className="py-2.5 text-right">{formatINRPaise(invoice.giftWrapTaxPaise)}</td>
              <td className="py-2.5 text-right">{formatINRPaise(invoice.giftWrapGrossPaise)}</td>
            </tr>
          )}
        </tbody>
      </table>

      <section className="ml-auto mt-6 w-full max-w-xs space-y-1.5">
        <Row label="Taxable value" value={formatINRPaise(invoice.taxablePaise)} />
        {/* Intra-state splits into two equal halves; anything crossing a state
            border is a single IGST line at the full rate. */}
        {intraState ? (
          <>
            <Row label={`CGST @ ${ratePercent / 2}%`} value={formatINRPaise(cgstPaise)} />
            <Row label={`SGST @ ${ratePercent / 2}%`} value={formatINRPaise(sgstPaise)} />
          </>
        ) : (
          <Row label={`IGST @ ${ratePercent}%`} value={formatINRPaise(igstPaise)} />
        )}
        <div className="flex justify-between border-t border-black/20 pt-2 font-medium">
          <span>Total</span>
          <span>{formatINRPaise(invoice.totalPaise)}</span>
        </div>
      </section>

      <footer className="mt-10 border-t border-black/20 pt-4 text-xs text-black/50">
        <p>
          Prices are inclusive of GST. This is a computer-generated invoice and does not
          require a signature.
        </p>
        {(seller.email || seller.phone) && (
          <p className="mt-1">
            {[seller.email, seller.phone].filter(Boolean).join(" · ")}
          </p>
        )}
      </footer>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-black/70">
      <span>{label}</span>
      <span className="text-black">{value}</span>
    </div>
  );
}
