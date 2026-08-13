/**
 * 出力の作法。
 * - 既定は人間向け（表・短い日本語）
 * - `--json` で機械向け（JSON だけを stdout に出す）
 * - **エラー・進捗・注意は stderr**（`--json` のとき stdout を汚さないため）
 * - **トークンを出さない。** 出すのは `ohmycms token create` で発行直後の1回だけ
 */

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function print(line = ""): void {
  process.stdout.write(`${line}\n`);
}

export function note(line: string): void {
  process.stderr.write(`${line}\n`);
}

function width(value: string): number {
  // 全角をおおよそ2幅として数える（日本語の見出しで列がずれるのを防ぐ）
  let total = 0;
  for (const char of value) {
    total += /[　-鿿！-｠]/.test(char) ? 2 : 1;
  }
  return total;
}

function pad(value: string, target: number): string {
  return value + " ".repeat(Math.max(0, target - width(value)));
}

export type Column<T> = {
  header: string;
  get: (row: T) => string;
};

/** 人間向けの表。0 件のときは呼び出し側が空メッセージを出す */
export function printTable<T>(rows: readonly T[], columns: readonly Column<T>[]): void {
  const cells = rows.map((row) => columns.map((column) => column.get(row)));
  const widths = columns.map((column, index) =>
    Math.max(width(column.header), ...cells.map((row) => width(row[index] ?? ""))),
  );

  print(columns.map((column, i) => pad(column.header, widths[i]!)).join("  ").trimEnd());
  print(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of cells) {
    print(row.map((cell, i) => pad(cell, widths[i]!)).join("  ").trimEnd());
  }
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
