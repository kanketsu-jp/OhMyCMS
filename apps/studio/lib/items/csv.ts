function csvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value;
}

function csvCell(value: unknown): string {
  const text = neutralizeFormula(csvValue(value));
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function csvBody(rows: Record<string, unknown>[], requestedColumns: string[]): string {
  const columns = requestedColumns.length > 0
    ? requestedColumns
    : Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const lines = [columns.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(row[column])).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
