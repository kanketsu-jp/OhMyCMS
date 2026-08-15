/**
 * Tiptap（WYSIWYGエディタ）が既定で押さえているキーバインドの集合を、
 * `node_modules` の実体（Tiptap自身のソース）から抽出するモジュール。
 *
 * 由来（2026-08-16・polish からの依頼・司令塔が決定）:
 * `components/admin/shortcuts.ts` の目録に `scope: "editor"`（エディタの中でだけ効く鍵）を
 * **導出**して足す担当（polish）が、この「Tiptap が押さえている組み合わせ」の集合を必要とした。
 *
 * 🚨 **抽出を向こうへ写させない。** 写しには「壊れたら落ちる」守り（`mod+i` が取れなければ
 * 検査が落ちる、等）が効かず、`node_modules` の中身が変わったときに**片方だけ古くなる**。
 * だから **1 つの実装を 2 箇所（`check-shortcuts.mjs` と polish 側）から import する**形にする。
 *
 * 抽出でハマった実測・パッケージグラフを辿る理由などの詳細コメントは、
 * 移設元 `check-shortcuts.mjs` の冒頭コメントを参照（重複を避けるためここには書かない）。
 */

import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 組み合わせを比較できる形へ揃える。
 * 修飾キーの**書き順が違うだけの同じ組み合わせ**（"mod+shift+k" と "shift+mod+k"）を
 * 別物として見逃さないため、小文字にして並べ替える。
 */
export function normalize(combo) {
  const parts = combo.toLowerCase().split("+");
  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1).sort();
  return [...modifiers, key].join("+");
}

/** Tiptap 記法（`"Mod-Shift-b"` のように `-` 区切り）を、`normalize()` に通せる形にする。 */
export function normalizeTiptapKey(raw) {
  return normalize(raw.split("-").join("+"));
}

/**
 * `startFile` から見て `expectedName` という package.json (`"name"` が一致するもの) を
 * ディレクトリを遡って探す。`require.resolve("@pkg/package.json")` は `exports` フィールドで
 * 弾かれるパッケージがある（実測: `@tiptap/starter-kit` はこれで失敗する）ため、
 * 解決済みのファイルパスから逆に辿る。
 */
export function findPackageJsonNear(startFile, expectedName) {
  let dir = dirname(startFile);
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, "package.json");
    if (existsSync(candidate)) {
      try {
        const pkg = JSON.parse(readFileSync(candidate, "utf8"));
        if (pkg.name === expectedName) return pkg;
      } catch {
        // 壊れたJSON等は無視して上へ遡り続ける
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * `addKeyboardShortcuts() { ... }` の本体をソース全体から**すべて**抜き出す
 * （1ファイルに複数の拡張がバンドルされていることがある。実測: `@tiptap/extension-list` の
 * dist に7個ある）。
 *
 * 🚨 終端は正規表現の固定パターン（`\n\s{2,4}\}` 等）に頼らない。それも取りこぼしの原因になる。
 *    文字列/テンプレートリテラルの中の `{` `}` を除外しつつ、開き括弧からの深さで閉じ括弧を探す。
 *
 * `check-shortcuts.mjs` の `collectAppOverrides()`（アプリ側の上書き検出）からも共用するため
 * export する。
 */
export function extractFunctionBodies(source, functionName) {
  const bodies = [];
  const marker = new RegExp(`${functionName}\\s*\\(\\s*\\)\\s*\\{`, "g");
  let m;
  while ((m = marker.exec(source)) !== null) {
    const openBraceIndex = m.index + m[0].length - 1;
    let depth = 0;
    let inString = null; // ' " ` のいずれか。文字列/テンプレートの中は括弧を数えない。
    let end = -1;
    for (let i = openBraceIndex; i < source.length; i++) {
      const ch = source[i];
      if (inString) {
        if (ch === "\\") {
          i++; // エスケープの次の1文字はそのまま読み飛ばす
          continue;
        }
        if (ch === inString) inString = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        inString = ch;
        continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) continue; // 閉じが見つからない = パース失敗。この関数体は諦める。
    bodies.push(source.slice(openBraceIndex, end + 1));
  }
  return bodies;
}

/**
 * 関数体の中から `"Mod-…"` のリテラルと `` `Mod-…` `` のテンプレートリテラルを拾う。
 * テンプレートリテラルに `${…}` が入っている（例: `` `Mod-Alt-${level}` ``）ものは
 * 静的に確定できないので `dynamic: true` にし、比較対象から外す（黙って落とさず別枠で報告する）。
 */
export function extractModBindings(bodyText) {
  const bindings = [];
  for (const m of bodyText.matchAll(/"(Mod-[^"]+)"/g)) {
    bindings.push({ raw: m[1], dynamic: false });
  }
  for (const m of bodyText.matchAll(/`([^`]*Mod-[^`]*)`/g)) {
    bindings.push({ raw: m[1], dynamic: m[1].includes("${") });
  }
  return bindings;
}

/**
 * `studio/package.json` に直接書かれている `@tiptap/*` を起点に、パッケージグラフを
 * （`package.json` の `dependencies` + 実際の `require()`/`import` 文の両方から）辿って、
 * 到達したすべてのパッケージの `addKeyboardShortcuts()` を集める。
 *
 * 🚨 `dependencies` だけでは足りないことがある（実測: `@tiptap/extension-bullet-list` は
 *    `@tiptap/extension-list` への依存を `peerDependencies` にしか書いておらず、
 *    `dependencies` は空。ただし今回は `starter-kit` がその実体側 `extension-list` も
 *    直接 `dependencies` に持っているため実害は無い）。念のため、実ファイルの
 *    `require("@tiptap/…")` / `from "@tiptap/…"` も走査して子パッケージ候補に足す。
 */
export function collectTiptapBindings(studioRoot) {
  const studioPkgPath = join(studioRoot, "package.json");
  const studioPkg = JSON.parse(readFileSync(studioPkgPath, "utf8"));
  const rootNames = Object.keys(studioPkg.dependencies ?? {}).filter((n) => n.startsWith("@tiptap/"));

  const visitedNames = new Set();
  const queue = rootNames.map((name) => ({ name, ctxFile: studioPkgPath }));
  const bindings = []; // { pkgName, raw, dynamic }
  const skipped = []; // 解決できなかったパッケージ（想定内: サブパスのみで root export が無いもの等）
  const visitedList = [];

  while (queue.length > 0) {
    const { name, ctxFile } = queue.shift();
    if (visitedNames.has(name)) continue;
    visitedNames.add(name);

    const req = createRequire(ctxFile);
    let mainPath;
    try {
      mainPath = req.resolve(name);
    } catch (e) {
      skipped.push({ name, reason: e.message });
      continue;
    }
    visitedList.push({ name, mainPath });

    const text = readFileSync(mainPath, "utf8");
    for (const body of extractFunctionBodies(text, "addKeyboardShortcuts")) {
      for (const b of extractModBindings(body)) {
        bindings.push({ pkgName: name, ...b });
      }
    }

    const childNames = new Set();
    const pkgJson = findPackageJsonNear(mainPath, name);
    if (pkgJson) {
      for (const dep of Object.keys(pkgJson.dependencies ?? {})) {
        if (dep.startsWith("@tiptap/")) childNames.add(dep);
      }
    }
    for (const m of text.matchAll(/(?:require\(|from\s+)["']@tiptap\/([a-z0-9-]+)["']/g)) {
      childNames.add(`@tiptap/${m[1]}`);
    }
    for (const child of childNames) {
      if (!visitedNames.has(child)) queue.push({ name: child, ctxFile: mainPath });
    }
  }

  return { bindings, skipped, visited: visitedList };
}

/** 抽出結果を正規化キーでまとめる（同じ組み合わせが複数パッケージ/大文字小文字違いで登録されうる）。 */
export function groupTiptapBindings(bindings) {
  const literal = bindings.filter((b) => !b.dynamic);
  const dynamic = bindings.filter((b) => b.dynamic);
  const map = new Map(); // normalized -> [{ raw, pkgName }]
  for (const b of literal) {
    const norm = normalizeTiptapKey(b.raw);
    if (!map.has(norm)) map.set(norm, []);
    map.get(norm).push({ raw: b.raw, pkgName: b.pkgName });
  }
  return { map, literal, dynamic };
}

/** 抽出が健全か（0件なら壊れている）を判定する純関数。真偽どちらの入力でも self-test できるようにする。 */
export function isExtractionHealthy(literalCount) {
  return literalCount > 0;
}

/** このモジュールの位置から `apps/studio` を解決する（呼び出し元の cwd に依存しないため）。 */
function defaultStudioRoot() {
  return dirname(dirname(fileURLToPath(import.meta.url)));
}

/**
 * `tiptapCombos()` が**返す値**（`combos` / `map`）が使い物になるかを判定する純粋関数。
 *
 * 由来（2026-08-16・shell の実測で見つかった穴）:
 * 旧版の守りは `literal`（＝入力側。抽出した生表記の配列）だけを見ていた。そのため
 * `normalizeTiptapKey()` が壊れて `null` を返すようになっても、`literal` 自体は
 * 無傷（"Mod-i" という生表記はそのまま抽出できている）なので守りは鳴らず、
 * **`map` の鍵が `null` になった壊れた集合をそのまま返してしまう**実測が取れた
 * （壊す前: throw しない / 壊した後: `combos` 18件・`null` の鍵1件・`mod+i` 欠落 だが throw しない）。
 *
 * 🚨 だから**返す値の側**（`combos` / `map`）を見る。`literal` 由来の確認（④）は
 * 「入り口は壊れていない」ことの補強として残すが、それだけには頼らない。
 *
 * 検査は本番と同じ純関数を使う（＝検査が通す入口と、本番が通る入口を同じにする。
 * 司令塔の規律・2026-08-16「囮は実物と同じ入口から入れる」）。
 *
 * @param {{
 *   combos: Set<string>,
 *   map: Map<unknown, Array<{ raw: string, pkgName: string }>>,
 *   literal: Array<{ raw: string, pkgName: string, dynamic: boolean }>,
 *   visited?: Array<unknown>,
 *   skipped?: Array<{ name: string, reason: string }>,
 * }} args
 * @throws {Error} 以下のいずれかに当てはまる場合。メッセージで「何がどう駄目だったか」を書き分ける。
 *   ① `combos.size === 0`（そもそも何も拾えていない）
 *   ② `map` の鍵に `null` / `undefined` / 空文字 / 文字列でないものが混ざっている（正規化が壊れた兆候）
 *   ③ `combos` に `"mod+i"` が含まれない（返す値の側で見た衝突検査の中核）
 *   ④ `literal` に `@tiptap/extension-italic` 由来の `"Mod-i"` が含まれない（入力側の補強確認）
 */
export function assertCombosUsable({ combos, map, literal, visited = [], skipped = [] }) {
  // ① そもそも何も拾えていない状態を、真っ先に弾く。
  if (!(combos instanceof Set) || combos.size === 0) {
    throw new Error(
      `assertCombosUsable: combos が空（訪問パッケージ ${visited.length} 件 / スキップ ${skipped.length} 件）。` +
        `「衝突が無い」のではなく「見ていない」状態。抽出器（パッケージ解決 or 正規表現）が壊れている可能性がある。`,
    );
  }

  // ② map の鍵に null / undefined / 空文字 / 文字列でないものが混ざっていないこと。
  //    正規化（normalizeTiptapKey）が壊れた兆候であり、混ざったまま返すと下流が静かに壊れる。
  const badKeys = [...map.keys()].filter((k) => typeof k !== "string" || k.length === 0);
  if (badKeys.length > 0) {
    throw new Error(
      `assertCombosUsable: map の鍵に不正な値が ${badKeys.length} 件混ざっている` +
        `（${badKeys.map((k) => JSON.stringify(k)).join(", ")}）。` +
        `正規化（normalizeTiptapKey）が壊れている可能性がある。`,
    );
  }

  // ③ 本題: 返す値（combos）の側で mod+i を見る。literal だけを見ていると、
  //    正規化が壊れて mod+i が別の鍵（null 等）の下に紛れ込んでも気づけない。
  if (!combos.has("mod+i")) {
    throw new Error(
      `assertCombosUsable: mod+i が combos に含まれていない（一意な組み合わせ ${combos.size} 件のうち0件）。` +
        `「衝突が無い」ではなく「見ていない」状態。正規化が壊れて mod+i が別の鍵に紛れ込んでいる可能性がある。`,
    );
  }

  // ④ 入力側（literal）の補強確認。@tiptap/extension-italic 由来の "Mod-i" が
  //    実際に抽出できているかを見る（③だけに頼らない）。
  const modIHits = literal.filter(
    (b) => b.raw.toLowerCase() === "mod-i" && b.pkgName === "@tiptap/extension-italic",
  );
  if (modIHits.length === 0) {
    throw new Error(
      `assertCombosUsable: mod+i（@tiptap/extension-italic 由来）が抽出結果（literal）に含まれない` +
        `（リテラル ${literal.length} 件）。combos に mod+i があっても、出所が extension-italic と確認できない。`,
    );
  }
}

/**
 * polish（`scope: "editor"` を導出する担当）向けの入口。
 *
 * 戻り値の形:
 *   - `combos`:  `Set<string>` — 正規化済みの組み合わせ文字列（例: `"mod+i"`）の集合
 *   - `sources`: `Map<string, Array<{ raw: string, pkgName: string }>>` —
 *                組み合わせごとの出所（どのパッケージの、どんな生表記から来たか）
 *   - `dynamic`: `Array<{ pkgName: string, raw: string, dynamic: true }>` —
 *                `${level}` 等を含み静的に確定できなかったもの（比較対象外・参考情報）
 *   - `skipped`: `Array<{ name: string, reason: string }>` —
 *                パッケージ解決に失敗し読めなかったもの（想定内のこともある）
 *
 * 🚨 **守り（写しでは効かない部分）**: `assertCombosUsable()` に**返す値**（`combos` / `map`）を
 * 通して判定する。抽出が 0 件、鍵に `null` 等が混ざっている、または `mod+i` が
 * `combos` に含まれない場合は throw する。どれも「衝突が無い」ではなく「見ていない」ため、
 * 黙って壊れた集合を返さない。
 *
 * @param {string} [studioRoot] 省略時はこのモジュールの位置から `apps/studio` を解決する。
 */
export function tiptapCombos(studioRoot) {
  const root = studioRoot ?? defaultStudioRoot();
  const { bindings, skipped, visited } = collectTiptapBindings(root);
  const { map, literal, dynamic } = groupTiptapBindings(bindings);
  const combos = new Set(map.keys());

  assertCombosUsable({ combos, map, literal, visited, skipped });

  return {
    combos,
    sources: map,
    dynamic,
    skipped,
  };
}
