#!/usr/bin/env node
/**
 * API の返し方（素の配列 か `{ data: … }` か）と、呼ぶ側の受け方が食い違っていないかを見る。
 *
 * 🚨 なぜ要るか（2026-08-17・design が実際に踏んだ）:
 *   この家の `ok(data)` は `Response.json(data)` で **包まない**。包むかどうかは
 *   route ごとに `ok()` へ何を渡すかで決まる。実測すると **80 組中 58 組が `{ data: … }`** で、
 *   **素の配列で返すのは 4 口だけ**だった:
 *     GET /api/collections ／ GET /api/fields ／ GET /api/fields/:collection ／ GET /api/relations
 *   design はその 1 つを `j?.data ?? []` で受け、**常に 0 件**になった。
 *   🚨 「データが無い 0」ではなく「見ていない 0」で、その誤読のせいで要らない DDL を 1 回打っている。
 *
 * 🚨 なぜ「揃える」でなく「検査」なのか:
 *   4 口を `{ data: … }` へ揃える案を出したが、母集合を `apps/studio` だけで切っていた。
 *   広げたら **`packages/sdk/src/client.ts` が `request<Field[]>` と公開の型で宣言**しており、
 *   CLI・MCP・外部の利用者の型まで壊れる **破壊的変更**だと分かった（実行前に取り消した）。
 *   → いまのコードは 1 箇所も間違えていない。守るのは **これから書く人**。
 *
 * 判定のしかた: **推測しない。宣言どうしを突き合わせる。**
 *   `apiFetch<T>(path)` / `request<T>({ path })` の **型引数**が、その route の実型と合うか。
 *   生 `fetch` は型が無いので、**本文を parse している箇所だけ**を `.data` の有無で見る。
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readTracked, trackedGlob } from "./lib/tracked-files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STUDIO = path.join(__dirname, "..");
const ROOT = path.join(STUDIO, "..", "..");

/**
 * 🚨 見ていない範囲（**出力にも毎回出す**）。
 * ここに書いていないものを「見た」と読ませないための一覧。
 */
const BLIND_SPOTS = [
  "acceptance/** … 型を持たない受け方（`admin.get(\"/api/fields\")`）なので照合できない。" +
    "既知の消費者 2 箇所: 08-row-permission.mjs / v1-cd-editor-otp.mjs",
  "README・docs の例示コード（実行されない）",
  "実行時の応答（コードだけを読む。サーバは叩かない）",
  "`ok()` を通らない返し方（`new Response(null, { status: 204 })` など。本文が無いので形の話に入らない）",
];

// ── 返す側 ───────────────────────────────────────────────────────────────

/** `return ok( … )` の引数を、括弧の対応で切り出す。 */
function okArguments(source) {
  const out = [];
  const re = /return\s+ok\(/g;
  let m;
  while ((m = re.exec(source))) {
    let i = m.index + m[0].length;
    let depth = 1;
    const start = i;
    for (; i < source.length && depth > 0; i += 1) {
      const c = source[i];
      if (c === "(" || c === "{" || c === "[") depth += 1;
      else if (c === ")" || c === "}" || c === "]") depth -= 1;
    }
    const before = source.slice(0, m.index);
    const methods = before.match(/export async function (GET|POST|PATCH|PUT|DELETE)/g) ?? [];
    const method = methods.length ? methods[methods.length - 1].split(" ").pop() : "?";
    out.push({ arg: source.slice(start, i - 1).trim(), method });
  }
  return out;
}

/**
 * 関数名から戻り型の「形」を引く。
 * 🚨 **型別名を 1 段開く**。開かないと `ItemsListResult`（中身は `{ data: Item[] }`）を
 *   「ただのオブジェクト」と読み、**`/api/items` の不一致を 1 件も検出できない**
 *   （2026-08-17、囮を当てて初めて分かった。囮が無ければ「0 件」を配っていた）。
 */
function returnShape(name, libs) {
  for (const [, src] of libs) {
    const re = new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\s*\\(`, "g");
    const m = re.exec(src);
    if (!m) continue;
    let i = m.index + m[0].length;
    let depth = 1;
    for (; i < src.length && depth > 0; i += 1) {
      const c = src[i];
      if (c === "(") depth += 1;
      else if (c === ")") depth -= 1;
    }
    const brace = src.indexOf("{", i);
    const annotation = src.slice(i, brace === -1 ? i : brace).replace(/\s+/g, " ").trim();
    if (/\[\]\s*>/.test(annotation)) return "素の配列";
    const alias = annotation.match(/Promise<\s*([A-Za-z_][A-Za-z0-9_]*)\s*>/);
    if (alias) {
      for (const [, other] of libs) {
        const decl = new RegExp(`export type ${alias[1]}\\s*=\\s*\\{([\\s\\S]{0,240})`).exec(other);
        if (!decl) continue;
        const first = decl[1].replace(/^\s*\n?/, "").match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\??:/);
        return first && first[1] === "data" ? "{data}" : "オブジェクト";
      }
    }
    if (/Promise<\s*\{/.test(annotation)) return "オブジェクト";
    return "未解決";
  }
  return "未解決";
}

function loadRoutes(transform) {
  const libFiles = trackedGlob("lib/**/*.ts", { cwd: STUDIO });
  const libs = libFiles.map((f) => [f, transform(f, readTracked(path.join(STUDIO, f)) ?? "")]);
  const routeFiles = trackedGlob("app/api/**/route.ts", { cwd: STUDIO });
  const routes = new Map();
  for (const file of routeFiles) {
    const src = transform(file, readTracked(path.join(STUDIO, file)) ?? "");
    const url =
      "/" +
      file
        .replace(/^app\//, "")
        .replace(/\/route\.ts$/, "")
        .replace(/\[(\.\.\.)?([A-Za-z0-9_]+)\]/g, ":$2");
    for (const { arg, method } of okArguments(src)) {
      let kind;
      if (arg.startsWith("{")) {
        const key = arg.match(/^\{\s*([A-Za-z_][A-Za-z0-9_]*)/);
        kind = key && key[1] === "data" ? "{data}" : "オブジェクト";
      } else if (arg.startsWith("[")) {
        kind = "素の配列";
      } else {
        const head = arg.match(/^(?:await\s+)?([A-Za-z_][A-Za-z0-9_]*)/);
        kind = head ? returnShape(head[1], libs) : "未解決";
      }
      routes.set(`${method} ${url}`, { kind, file });
    }
  }
  return { routes, routeFiles, libFiles };
}

// ── 呼ぶ側 ───────────────────────────────────────────────────────────────

/** 型引数の見た目から「呼ぶ側が期待している形」を決める。 */
function declaredShape(typeArg) {
  if (/\[\]\s*$/.test(typeArg)) return "素の配列";
  if (/^\{\s*data\b/.test(typeArg)) return "{data}";
  return "その他";
}

function matchRoute(routes, method, url) {
  for (const [key, value] of routes) {
    const [routeMethod, routeUrl] = key.split(" ");
    if (routeMethod !== method) continue;
    const re = new RegExp("^" + routeUrl.replace(/:[A-Za-z0-9_]+/g, "[^/]+") + "$");
    if (re.test(url)) return value;
  }
  return null;
}

function normalizeUrl(raw) {
  return (
    "/" +
    raw
      .replace(/^.*?\/api\//, "api/")
      .split("?")[0]
      .replace(/\$\{[^}]*\}/g, "x")
      .replace(/\/$/, "")
  );
}

function loadCallers(transform, routes) {
  const studioFiles = [
    ...trackedGlob("app/**/*.tsx", { cwd: STUDIO }),
    ...trackedGlob("app/**/*.ts", { cwd: STUDIO }),
    ...trackedGlob("components/**/*.tsx", { cwd: STUDIO }),
    ...trackedGlob("components/**/*.ts", { cwd: STUDIO }),
  ];
  const packageFiles = trackedGlob("packages/*/src/**/*.ts", { cwd: ROOT });
  const typed = [];
  const raw = [];
  let rawTotal = 0;

  const pushTyped = (file, src, index, typeArg, url, method) => {
    const line = src.slice(0, index).split("\n").length;
    const route = matchRoute(routes, method, normalizeUrl(url));
    typed.push({ file, line, url: normalizeUrl(url), method, typeArg, route });
  };

  for (const file of studioFiles) {
    const src = transform(file, readTracked(path.join(STUDIO, file)) ?? "");
    // ① apiFetch<T>("/api/…")
    const apiRe = /apiFetch<([^>]*(?:>[^>(]*)?)>\(\s*[`"']([^`"']*)[`"']/g;
    let m;
    while ((m = apiRe.exec(src))) {
      if (!m[2].includes("/api/")) continue;
      const method = (src.slice(m.index, m.index + 300).match(/method:\s*"([A-Z]+)"/) ?? [, "GET"])[1];
      pushTyped(file, src, m.index, m[1].replace(/\s+/g, " ").trim(), m[2], method);
    }
    // ② 生 fetch（**本文を parse している箇所だけ**）
    const rawRe = /(?<!api)fetch\(\s*[`"']([^`"']*)[`"']/g;
    while ((m = rawRe.exec(src))) {
      if (!m[1].includes("/api/")) continue;
      rawTotal += 1;
      const window = src.slice(m.index, m.index + 1200);
      const nextFetch = window.search(/\n\s*(const|let)\s+\w+\s*=\s*(await\s+)?fetch\(/);
      const tail = nextFetch > 0 ? window.slice(0, nextFetch) : window;
      if (!/\.\s*json\(\)/.test(tail)) continue;
      const method = (tail.match(/method:\s*"([A-Z]+)"/) ?? [, "GET"])[1];
      const line = src.slice(0, m.index).split("\n").length;
      raw.push({
        file,
        line,
        url: normalizeUrl(m[1]),
        method,
        usesDotData: /[A-Za-z0-9_)\]]\s*\??\.\s*data([^A-Za-z0-9_]|$)/.test(tail) || /as\s*\{\s*data\b/.test(tail),
        route: matchRoute(routes, method, normalizeUrl(m[1])),
      });
    }
  }

  // ③ packages/*/src の SDK（**司令塔の指示で母集合に入れた**。ここを外すと外向きの型が守れない）
  for (const file of packageFiles) {
    const src = transform(file, readTracked(path.join(ROOT, file)) ?? "");
    const sdkRe = /request<([^>]*(?:>[^>(]*)?)>\(\s*\{[^}]*?path:\s*[`"']([^`"']*)[`"']/g;
    let m;
    while ((m = sdkRe.exec(src))) {
      if (!m[2].includes("/api/")) continue;
      const method = (src.slice(m.index, m.index + 300).match(/method:\s*"([A-Z]+)"/) ?? [, "GET"])[1];
      pushTyped(file, src, m.index, m[1].replace(/\s+/g, " ").trim(), m[2], method);
    }
  }
  return { typed, raw, rawTotal, studioFiles, packageFiles };
}

// ── 判定 ─────────────────────────────────────────────────────────────────

function judge({ typed, raw }) {
  const findings = [];
  for (const c of typed) {
    if (!c.route || c.route.kind === "未解決") continue;
    const want = c.route.kind;
    const got = declaredShape(c.typeArg);
    if (got === "その他") continue; // 名前付きの型は開かない（**そこは見ていない**）
    if (want === "素の配列" && got === "{data}") {
      findings.push({ ...c, why: "素の配列で返る口を { data: … } で受けている（常に undefined）" });
    }
    if (want === "{data}" && got === "素の配列") {
      findings.push({ ...c, why: "{ data: … } で返る口を配列で受けている（map / length が壊れる）" });
    }
  }
  for (const c of raw) {
    if (!c.route || c.route.kind === "未解決") continue;
    if (c.route.kind === "素の配列" && c.usesDotData) {
      findings.push({ ...c, typeArg: "(型なし)", why: "素の配列で返る口を .data で受けている（常に undefined）" });
    }
  }
  return findings;
}

function collect(transform) {
  const { routes, routeFiles, libFiles } = loadRoutes(transform);
  const callers = loadCallers(transform, routes);
  return { routes, routeFiles, libFiles, ...callers, findings: judge(callers) };
}

// ── 自己検査（囮） ───────────────────────────────────────────────────────

/**
 * 🚨 囮は **ファイルを書き換えない**。`readTracked` で読んだ**文字列**を壊してから判定に流す。
 *   共有ツリーを汚さないので、予告も後始末も要らない。
 * 🚨 **置換が 0 件だった囮は失敗として落とす**。壊せていないのに緑になるのを防ぐ
 *   （実際に踏んだ: 置換は当たっているのに鳴らず、判定側の穴が見つかった）。
 */
const DECOYS = [
  {
    name: "素の配列の口を { data: … } で受ける",
    file: "app/(admin)/admin/collections/page.tsx",
    from: 'apiFetch<CollectionResult[]>("/api/collections")',
    to: 'apiFetch<{ data: CollectionResult[] }>("/api/collections")',
  },
  {
    name: "{ data: … } の口を配列で受ける",
    file: "app/(admin)/admin/content/[collection]/page.tsx",
    from: "apiFetch<ItemsPayload>(`/api/items/",
    to: "apiFetch<ItemRow[]>(`/api/items/",
  },
  {
    name: "SDK（packages）の型を入れ替える",
    file: "packages/sdk/src/client.ts",
    from: 'request<Field[]>({ path: "/api/fields" })',
    to: 'request<{ data: Field[] }>({ path: "/api/fields" })',
  },
  {
    name: "生 fetch で素の配列の口を .data で受ける",
    file: "components/admin/folder-labels-menu.tsx",
    from: 'fetch("/api/labels")',
    to: 'fetch("/api/collections")',
  },
  {
    // 🚨 これがいちばん起きうる事故。「4 口を { data: … } へ揃える」を途中まででやると、
    //   route だけ変わって呼ぶ側が置き去りになる。**そのとき呼ぶ側が全部鳴ること**を確かめる。
    name: "route 側だけ { data: … } に変える（揃える作業の途中で止まった状態）",
    file: "app/api/collections/route.ts",
    from: "return ok(await listCollections(includeSystem));",
    to: "return ok({ data: await listCollections(includeSystem) });",
    least: 3, // 呼ぶ側が複数あるので、1 件では足りない
  },
];

function runDecoys() {
  const results = [];
  for (const decoy of DECOYS) {
    let replaced = 0;
    const transform = (file, src) => {
      if (!file.endsWith(decoy.file)) return src;
      const parts = src.split(decoy.from);
      replaced += parts.length - 1;
      return parts.join(decoy.to);
    };
    const { findings } = collect(transform);
    results.push({ ...decoy, replaced, found: findings.length });
  }
  // 🟢 対照の対照: **実際に当たるが、違反ではない置換**。
  //   🚨 「当たらない置換で 0 件」では弱い（**何も起きていないだけ**）。
  //     ここは **置換 1 件以上 かつ 検出 0 件** でなければ、誤検出しないことを示せない。
  let controlReplaced = 0;
  const control = collect((file, src) => {
    if (!file.endsWith("app/(admin)/admin/collections/page.tsx")) return src;
    const parts = src.split('apiFetch<CollectionResult[]>("/api/collections")');
    controlReplaced += parts.length - 1;
    return parts.join('apiFetch<CollectionResult[]>("/api/collections") /* 対照: 違反ではない変更 */');
  });
  return { results, control: { replaced: controlReplaced, found: control.findings.length } };
}

// ── 本体 ─────────────────────────────────────────────────────────────────

function main() {
  const identity = (_file, src) => src;
  const real = collect(identity);
  let failed = false;

  const kinds = { "{data}": 0, 素の配列: 0, オブジェクト: 0, 未解決: 0 };
  for (const [, value] of real.routes) kinds[value.kind] = (kinds[value.kind] ?? 0) + 1;

  console.log("対象:");
  console.log(
    `  返す側 … route ${real.routeFiles.length} 本 → (method, url) ${real.routes.size} 組` +
      `（戻り型の解決に lib ${real.libFiles.length} 本を読んだ）`,
  );
  console.log(
    `  呼ぶ側 … studio ${real.studioFiles.length} 本 / packages ${real.packageFiles.length} 本` +
      ` → 型つき ${real.typed.length} 箇所 ／ 生 fetch ${real.rawTotal} 箇所` +
      `（うち本文を parse している ${real.raw.length} 箇所）`,
  );
  // 🚨 0 の分類も必ず出す。出さないと「無かった」が出力から消える
  console.log(`  返し方の内訳 … ${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(" / ")}`);
  console.log("見ていない範囲:");
  for (const spot of BLIND_SPOTS) console.log(`  ・${spot}`);

  if (real.routes.size === 0 || real.typed.length === 0) {
    console.error("🚨 走査できていません（route 0 組 か 呼ぶ側 0 箇所）。この 0 は「見ていない 0」です。");
    failed = true;
  }

  const { results, control } = runDecoys();
  console.log("自己検査（囮はファイルを書き換えず、読んだ文字列を壊す）:");
  for (const r of results) {
    const least = r.least ?? 1;
    const ok = r.replaced > 0 && r.found >= least;
    console.log(
      `  ${ok ? "🟢" : "🚨"} ${r.name} … 置換 ${r.replaced} 件 / 検出 ${r.found} 件` +
        (r.least ? `（${r.least} 件以上を期待）` : ""),
    );
    if (r.replaced === 0) {
      console.error(`🚨 囮が届いていません（置換 0 件）: ${r.name} — 的が動いた可能性があります`);
      failed = true;
    } else if (r.found < least) {
      console.error(`🚨 壊したのに検出が足りません（${r.found} < ${least}）: ${r.name}`);
      failed = true;
    }
  }
  console.log(
    `  ${control.replaced > 0 && control.found === 0 ? "🟢" : "🚨"} 対照（当たるが違反ではない置換）` +
      `… 置換 ${control.replaced} 件 / 検出 ${control.found} 件`,
  );
  if (control.replaced === 0) {
    console.error("🚨 対照が当たっていません（置換 0 件）。誤検出しないことを示せていません。");
    failed = true;
  } else if (control.found !== 0) {
    console.error("🚨 違反ではない変更で検出が出ました（誤検出）。");
    failed = true;
  }

  if (real.findings.length > 0) {
    console.error(`\n🚨 返し方と受け方が食い違っています（${real.findings.length} 件）:`);
    for (const f of real.findings) {
      console.error(`  ${f.file}:${f.line}  ${f.method} ${f.url}`);
      console.error(`     宣言 <${f.typeArg}> ／ 実型 ${f.route.kind}（${f.route.file}）`);
      console.error(`     ${f.why}`);
    }
    console.error(
      "\n  直し方: 呼ぶ側の型引数を実型に合わせる。" +
        "素の配列で返るのは GET /api/collections ・/api/fields ・/api/fields/:collection ・/api/relations の 4 口だけで、" +
        "残りは { data: … } で返る。",
    );
    failed = true;
  } else {
    console.log("\n🟢 食い違いは 0 件（囮が鳴ることを確かめた 0 です）。");
  }

  process.exit(failed ? 1 : 0);
}

main();
