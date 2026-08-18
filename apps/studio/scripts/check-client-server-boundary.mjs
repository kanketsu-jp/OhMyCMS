import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

function sourceFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(fullPath));
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
}

function isClientModule(source) {
  return /^\s*["']use client["'];?\s*$/.test(source.split(/\r?\n/, 2)[0] ?? "");
}

function exportedValues(source) {
  const values = new Set();
  for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) {
    if (!/^[A-Z]/.test(match[1])) values.add(match[1]);
  }
  for (const match of source.matchAll(/export\s+const\s+(\w+)/g)) values.add(match[1]);
  return values;
}

function resolveImport(importer, specifier) {
  const base = specifier.startsWith("@/")
    ? path.join(ROOT, specifier.slice(2))
    : path.resolve(path.dirname(importer), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function violations(root) {
  const files = sourceFiles(root);
  const clientExports = new Map();
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    if (isClientModule(source)) clientExports.set(file, exportedValues(source));
  }

  const found = [];
  for (const importer of files) {
    const source = fs.readFileSync(importer, "utf8");
    if (isClientModule(source)) continue;
    for (const match of source.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*["']([^"']+)["']/g)) {
      const target = resolveImport(importer, match[2]);
      const exports = target && clientExports.get(target);
      if (!exports) continue;
      for (const item of match[1].split(",")) {
        const imported = item.trim().split(/\s+as\s+/)[0];
        if (exports.has(imported)) found.push(`${path.relative(ROOT, importer)} imports ${imported} from ${path.relative(ROOT, target)}`);
      }
    }
  }
  return found;
}

function runSelfTest() {
  const fixture = path.join(ROOT, ".temp", `client-server-boundary-${process.pid}`);
  fs.mkdirSync(fixture, { recursive: true });
  const client = path.join(fixture, "client.ts");
  const server = path.join(fixture, "server.ts");
  try {
    fs.writeFileSync(client, '"use client";\nexport function helper() {}\nexport function Widget() {}\n');
    fs.writeFileSync(server, 'import { helper, Widget } from "./client";\n');
    const red = violations(fixture);
    if (red.length !== 1 || !red[0].includes("helper")) throw new Error(`RED self-test failed: ${red.join(", ")}`);
    fs.writeFileSync(server, 'import { Widget } from "./client";\n');
    const green = violations(fixture);
    if (green.length !== 0) throw new Error(`GREEN self-test failed: ${green.join(", ")}`);
    console.log("client-server-boundary self-test: RED 1, GREEN 0");
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

if (process.argv.includes("--self-test")) runSelfTest();
else {
  const found = violations(ROOT);
  if (found.length) {
    console.error(found.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("client-server-boundary: 0 violations");
  }
}
