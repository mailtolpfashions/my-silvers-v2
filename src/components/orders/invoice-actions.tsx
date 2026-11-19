"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * The buttons above an invoice: Download PDF, and Print / Save as PDF.
 *
 * ── Why a Download button at all (Nov 2026) ─────────────────────────────────
 * "Print / Save as PDF" hands the job to the browser's print window, and on
 * testers' machines that went wrong in ways the shop never saw: a PDF that
 * looked blank on a phone, and a 0 KB file on a desktop ("Failed to load PDF
 * document"). Download builds the file itself — the invoice as drawn on
 * screen, so ₹, Tamil names and addresses all come out exactly right — and
 * saves it as `<order number>-invoice.pdf`. No print window involved.
 *
 * Drawn in the shopper's own browser: html2canvas-pro paints the invoice
 * (the original html2canvas cannot read the oklab/oklch colours Tailwind v4
 * emits, and failed outright), jsPDF wraps it in A4. Both are imported only
 * on the click, so neither enters the page's normal bundle.
 *
 * ── Why the title changes while printing ────────────────────────────────────
 * Browsers name a "Save as PDF" file after the page title, which was "Tax
 * invoice | MY Silvers" for every order. While the print window is open the
 * title is the order number, so the saved file is named after the order —
 * whether the print came from the button or from Ctrl+P.
 */
export function InvoiceActions({
  orderNumber,
  printLabel = "Print / Save as PDF",
}: {
  orderNumber: string;
  printLabel?: string;
}) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let previous = document.title;
    const before = () => {
      previous = document.title;
      document.title = `Invoice ${orderNumber}`;
    };
    const after = () => {
      document.title = previous;
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, [orderNumber]);

  async function download() {
    const invoice = document.querySelector<HTMLElement>("[data-invoice]");
    if (!invoice) return;
    setBusy(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ]);
      // Laid out at a desk width, whatever the screen: on a phone the invoice
      // column is ~360px and the table squeezes; the PDF should look the same
      // from every device.
      const WIDTH = 820;
      const canvas = await html2canvas(invoice, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        windowWidth: WIDTH,
        onclone: (doc) => {
          const el = doc.querySelector<HTMLElement>("[data-invoice]");
          if (el) {
            el.style.width = `${WIDTH}px`;
            el.style.maxWidth = "none";
            el.style.padding = "32px";
          }
        },
      });

      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pageW) / canvas.width;
      const image = canvas.toDataURL("image/jpeg", 0.92);
      // One page for any normal invoice; a very long one continues on more.
      for (let y = 0, page = 0; y < imgH; y += pageH, page++) {
        if (page > 0) pdf.addPage();
        pdf.addImage(image, "JPEG", 0, -y, pageW, imgH);
      }
      pdf.setProperties({ title: `Invoice ${orderNumber}`, subject: "Tax invoice", creator: "MY Silvers" });
      pdf.save(`${orderNumber}-invoice.pdf`);
    } catch (err) {
      console.error("[invoice] download failed", err);
      toast.error("Couldn't create the PDF. Please try Print / Save as PDF instead.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        {printLabel}
      </Button>
      <Button size="sm" onClick={download} disabled={busy}>
        {busy ? "Preparing PDF…" : "Download PDF"}
      </Button>
    </div>
  );
}
