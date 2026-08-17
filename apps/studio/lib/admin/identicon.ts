const GRID_SIZE = 5;
const CELL_SIZE = 20;

function hash(value: string): number {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.codePointAt(0) ?? 0;
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

/** 利用者 id だけから、外部通信なしで再現可能な identicon を作る。 */
export function identiconDataUri(userId: string): string {
  const seed = hash(userId);
  const hue = seed % 360;
  const background = `hsl(${hue} 28% 96%)`;
  const foreground = `hsl(${hue} 62% 42%)`;
  const cells: string[] = [];
  let bits = seed;

  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let column = 0; column < Math.ceil(GRID_SIZE / 2); column += 1) {
      bits = Math.imul(bits ^ (bits >>> 13), 1274126177) >>> 0;
      if ((bits & 1) === 0) continue;
      const mirroredColumn = GRID_SIZE - column - 1;
      cells.push(`<rect x="${column * CELL_SIZE}" y="${row * CELL_SIZE}" width="${CELL_SIZE}" height="${CELL_SIZE}"/>`);
      if (mirroredColumn !== column) {
        cells.push(`<rect x="${mirroredColumn * CELL_SIZE}" y="${row * CELL_SIZE}" width="${CELL_SIZE}" height="${CELL_SIZE}"/>`);
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${background}"/><g fill="${foreground}">${cells.join("")}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
