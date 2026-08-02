/**
 * Client-side PDF generation. jsPDF and its autotable plugin are dynamically
 * imported so they never enter the main bundle — they're only fetched when an
 * admin actually clicks "Export PDF".
 */
export async function downloadTablePdf(params: {
  title: string;
  headers: string[];
  rows: string[][];
  filename: string;
}) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFontSize(16);
  doc.text(params.title, 14, 16);
  doc.setFontSize(9);
  doc.text(
    `MY Silvers · generated ${new Date().toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    })}`,
    14,
    22
  );

  autoTable(doc, {
    head: [params.headers],
    body: params.rows,
    startY: 28,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [38, 38, 38] },
  });

  doc.save(params.filename);
}
