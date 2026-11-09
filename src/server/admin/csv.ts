/**
 * CSV for the admin exports (orders, customers, products).
 *
 * ⚠️  Formula injection. These files are opened in Excel or Google Sheets, and
 * a cell beginning with = + - @ (or a tab / carriage return) is run as a
 * FORMULA there. Names, addresses and notes are typed by shoppers, so a
 * customer called `=HYPERLINK("https://evil.example","Click")` — or worse, a
 * DDE payload — would execute on the admin's machine when the export opens.
 *
 * Such text cells are prefixed with an apostrophe, which spreadsheets treat as
 * "this is text" and do not display. Real numbers (a negative refund, say) are
 * passed as numbers and left untouched, so they still sum.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function toCsv(headers: string[], rows: Array<Array<string | number | boolean | null>>): string {
  const escape = (v: string | number | boolean | null): string => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    // A plain number like "-150.00" (decimals arrive as strings) is data, not a
    // formula; prefixing it would turn it into text that no longer sums.
    if (typeof v === "string" && FORMULA_START.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\r\n");
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
