import { prisma } from "@/server/db";
import { toPaise } from "@/server/orders/money";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Tax invoices.
 *
 * ── The one assumption worth knowing ─────────────────────────────────────────
 * PRICES ON THIS SITE ARE GST-INCLUSIVE. That is the norm for Indian D2C — the
 * figure on the product page is what the customer pays — and it means an
 * invoice does not add tax on top, it EXTRACTS the tax already inside the
 * total. Get this backwards and every invoice overstates the amount due by the
 * GST rate while the customer's card statement says something else.
 *
 * If prices are ever changed to be exclusive, `splitInclusive` below is the
 * only function that has to change.
 *
 * ── What this is not ─────────────────────────────────────────────────────────
 * It produces a standard tax-invoice layout with the fields the format
 * requires. It is not tax advice, and nobody here has checked it against your
 * filings. Have your accountant read one before you send them to customers.
 */

/** Silver jewellery. 7113 covers articles of jewellery of precious metal. */
const DEFAULT_HSN = "7113";

/**
 * 3% is the GST rate on articles of jewellery under HSN 7113.
 *
 * Snapshot onto the order when the invoice is issued — see gstRatePercent in
 * the schema. Reading it live at render time would silently reprint every
 * historical invoice at a new rate if this ever changes, which would put your
 * reprints out of step with what was actually filed.
 */
const DEFAULT_GST_RATE = 3;

export type SellerIdentity = {
  legalName: string;
  address: string;
  gstin: string | null;
  state: string;
  stateCode: string | null;
  email: string | null;
  phone: string | null;
};

/**
 * Who the invoice is FROM, out of configuration rather than hardcoded.
 *
 * Returns nulls rather than throwing when unset: a half-configured seller
 * should still render an invoice with visible blanks, because a blank GSTIN on
 * screen gets noticed and fixed, whereas a 500 on the invoice route looks like
 * a bug in the order and gets reported as one.
 */
export function getSeller(): SellerIdentity {
  return {
    legalName: process.env.INVOICE_LEGAL_NAME || "MY Silvers",
    address: process.env.INVOICE_ADDRESS || "",
    gstin: process.env.INVOICE_GSTIN || null,
    state: process.env.INVOICE_STATE || "Tamil Nadu",
    stateCode: process.env.INVOICE_STATE_CODE || null,
    email: process.env.INVOICE_EMAIL || null,
    phone: process.env.INVOICE_PHONE || null,
  };
}

export function getHsnCode(): string {
  return process.env.INVOICE_HSN_CODE || DEFAULT_HSN;
}

/**
 * Pulls the tax back out of a GST-inclusive amount.
 *
 * taxable = inclusive / (1 + rate/100), and the tax is whatever is left — taken
 * as the REMAINDER rather than computed separately, so the two always add back
 * to exactly the amount charged. Computing both independently and rounding each
 * is how invoices end up a paisa short of the payment.
 */
function splitInclusive(inclusivePaise: number, ratePercent: number) {
  const taxablePaise = Math.round(inclusivePaise / (1 + ratePercent / 100));
  return { taxablePaise, taxPaise: inclusivePaise - taxablePaise };
}

export type InvoiceLine = {
  name: string;
  hsn: string;
  size: string;
  quantity: number;
  /** Unit price as charged, GST inclusive. */
  unitPaise: number;
  grossPaise: number;
  taxablePaise: number;
  taxPaise: number;
};

export type Invoice = {
  number: string;
  issuedAt: Date;
  orderNumber: string;
  orderedAt: Date;
  seller: SellerIdentity;
  buyer: {
    name: string;
    email: string;
    phone: string;
    address: string[];
    state: string;
    pincode: string;
  };
  lines: InvoiceLine[];
  hsn: string;
  ratePercent: number;
  /** True when buyer and seller are in the same state — CGST+SGST, not IGST. */
  intraState: boolean;
  itemsTaxablePaise: number;
  shippingGrossPaise: number;
  shippingTaxablePaise: number;
  shippingTaxPaise: number;
  /** Zero on every order that was not gift wrapped, so the row simply hides. */
  giftWrapGrossPaise: number;
  giftWrapTaxablePaise: number;
  giftWrapTaxPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalTaxPaise: number;
  totalPaise: number;
  paymentMethod: string;
  paymentStatus: string;
};

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true; user: true } }>;

type ShippingAddress = {
  fullName?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
};

/**
 * Issues an invoice number, once, on first render.
 *
 * NOT at order creation. A GST invoice series should be consecutive documents
 * that exist; burning a number on an order abandoned at the payment screen
 * leaves a hole you have to explain. Backed by `invoice_number_seq`, so
 * concurrent first-renders cannot collide.
 *
 * The financial-year segment is derived from the issue date, India's FY running
 * April to March: an invoice raised in March 2027 belongs to 26-27, one raised
 * that April to 27-28.
 */
async function issueNumber(orderId: string): Promise<{ number: string; at: Date; rate: number }> {
  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    select: { invoiceNumber: true, invoicedAt: true, gstRatePercent: true },
  });
  if (existing?.invoiceNumber && existing.invoicedAt) {
    return {
      number: existing.invoiceNumber,
      at: existing.invoicedAt,
      rate: Number(existing.gstRatePercent ?? DEFAULT_GST_RATE),
    };
  }

  const rows = await prisma.$queryRaw<Array<{ nextval: bigint }>>`SELECT nextval('invoice_number_seq')`;
  const at = new Date();
  const y = at.getFullYear();
  const startYear = at.getMonth() >= 3 ? y : y - 1;
  const fy = `${String(startYear).slice(2)}-${String(startYear + 1).slice(2)}`;
  const number = `MYS/${fy}/${String(rows[0].nextval).padStart(5, "0")}`;

  await prisma.order.update({
    where: { id: orderId },
    data: { invoiceNumber: number, invoicedAt: at, gstRatePercent: DEFAULT_GST_RATE },
  });

  return { number, at, rate: DEFAULT_GST_RATE };
}

/**
 * Builds the invoice for an order, issuing its number if this is the first time.
 *
 * Every figure is derived from the SNAPSHOT stored on the order — item names,
 * prices, the address — never from the live product or the customer's current
 * address. An invoice has to keep saying what was actually sold at the price it
 * was actually sold for, however the catalogue changes afterwards.
 */
export async function buildInvoice(order: OrderWithItems): Promise<Invoice> {
  const { number, at, rate } = await issueNumber(order.id);
  const seller = getSeller();
  const hsn = getHsnCode();
  const address = (order.shippingAddress ?? {}) as ShippingAddress;

  const lines: InvoiceLine[] = order.items.map((item) => {
    const unitPaise = toPaise(item.price);
    const grossPaise = unitPaise * item.quantity;
    const { taxablePaise, taxPaise } = splitInclusive(grossPaise, rate);
    return {
      name: item.name,
      hsn,
      size: item.size,
      quantity: item.quantity,
      unitPaise,
      grossPaise,
      taxablePaise,
      taxPaise,
    };
  });

  const itemsTaxablePaise = lines.reduce((sum, l) => sum + l.taxablePaise, 0);
  const itemsTaxPaise = lines.reduce((sum, l) => sum + l.taxPaise, 0);

  // Shipping on a jewellery order is a composite supply: it follows the
  // principal item's rate rather than the 18% a standalone courier service
  // would attract.
  const shippingGrossPaise = toPaise(order.shippingCharge);
  const shipping = splitInclusive(shippingGrossPaise, rate);

  /**
   * Gift wrap is taxed the same way and for the same reason.
   *
   * ⚠️  It has to be HERE, not just on the order. The invoice total is read
   * from order.totalAmount, which already includes the wrap — so leaving the
   * charge out of the taxable base produces a document whose parts do not add
   * up to its own total, on a GST invoice, which is the one place that cannot
   * be allowed to disagree with itself.
   *
   * Composite supply, like shipping: packaging bundled with the jewellery
   * follows the principal rate rather than attracting its own.
   */
  const giftWrapGrossPaise = toPaise(order.giftWrapCharge);
  const giftWrap = splitInclusive(giftWrapGrossPaise, rate);

  const totalTaxPaise = itemsTaxPaise + shipping.taxPaise + giftWrap.taxPaise;

  /**
   * Place of supply decides the split. Same state as the seller and the tax is
   * CGST + SGST in equal halves; anywhere else and the whole of it is IGST.
   * Compared case-insensitively because the state arrives from a form.
   */
  const intraState =
    (address.state ?? "").trim().toLowerCase() === seller.state.trim().toLowerCase();

  // The half that carries the odd paisa goes to CGST, so the two halves still
  // sum to exactly totalTaxPaise.
  const cgstPaise = intraState ? Math.ceil(totalTaxPaise / 2) : 0;
  const sgstPaise = intraState ? totalTaxPaise - cgstPaise : 0;
  const igstPaise = intraState ? 0 : totalTaxPaise;

  return {
    number,
    issuedAt: at,
    orderNumber: order.orderNumber,
    orderedAt: order.createdAt,
    seller,
    buyer: {
      name: address.fullName ?? order.user.name ?? "Customer",
      email: order.user.email,
      phone: address.phone ?? "",
      address: [address.addressLine1, address.addressLine2, address.city].filter(
        (l): l is string => Boolean(l && l.trim())
      ),
      state: address.state ?? "",
      pincode: address.pincode ?? "",
    },
    lines,
    hsn,
    ratePercent: rate,
    intraState,
    itemsTaxablePaise,
    shippingGrossPaise,
    shippingTaxablePaise: shipping.taxablePaise,
    shippingTaxPaise: shipping.taxPaise,
    giftWrapGrossPaise,
    giftWrapTaxablePaise: giftWrap.taxablePaise,
    giftWrapTaxPaise: giftWrap.taxPaise,
    taxablePaise: itemsTaxablePaise + shipping.taxablePaise + giftWrap.taxablePaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    totalTaxPaise,
    totalPaise: toPaise(order.totalAmount),
    paymentMethod: order.paymentMethod === "cod" ? "Cash on delivery" : "Prepaid (Razorpay)",
    paymentStatus: order.paymentStatus,
  };
}
