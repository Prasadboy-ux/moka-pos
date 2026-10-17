/**
 * CSV export, done in the browser.
 *
 * Values are quoted and internal quotes doubled so a product name containing a
 * comma cannot shift every later column. The BOM matters too: without it Excel
 * opens the file in the local code page and accented characters break.
 */
export function toCsv(rows: Array<Array<string | number>>): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell);
          // Leading =, +, - and @ are read as formulas by spreadsheet apps.
          const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
          return `"${safe.replace(/"/g, '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");
}

export function downloadCsv(filename: string, rows: Array<Array<string | number>>): void {
  // Prefixed so Excel detects UTF-8.
  const blob = new Blob(["﻿", toCsv(rows)], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();

  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}