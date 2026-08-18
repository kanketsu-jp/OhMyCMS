#!/usr/bin/env node
/**
 * ショートカットを**機械が読める形**で出す。
 *
 *   node scripts/build-shortcuts-manifest.mjs          # 人が読む形＋自己検査
 *   node scripts/build-shortcuts-manifest.mjs --json   # JSON だけ
 *
 * 由来（堀池さん 2026-08-15 原文）:
 * > 「**ショートカットは用意だけしておいて、つかいたければユーザーが使うようにする。
 * >   なるべく考えられる多くのショートカットを用意して、AI が Chrome 拡張などでサイトを
 * >   操作する時、活用する。（Skills・MCP で伝わるように）**」
 *
 * 🚨 **操作するのは Chrome 拡張。MCP / Skills は「伝わる」側**（司令塔 2026-08-16）。
 *    ここが出すのは **押し方の説明**であって、押す機能ではない。
 *
 * ## 出す形（司令塔が決定・2026-08-16）
 *
 *     { key, action, scope, label_key }
 *     scope … "global" ／ "editor" ／ "page:<パス>" ／ "unknown"
 *
 * 🚨 **`key` は記号で出さない**（`⌘K` ではなく `mod+k`）。
 *    記号は**言語ではなくプラットフォーム**で変わる（mac は ⌘ / Windows は Ctrl）ので、
 *    記号を渡すと**受け取った側で嘘になる**。`shortcuts.ts` が記号を辞書に持たせていないのと同じ理由。
 *
 * ## 🚨 scope は「宣言」ではなく「導出」する
 *
 * 各ショートカットに手で "global" と書かせると、**書いた場所と実装がずれても誰も気づけない**
 * （2026-08-15〜16 に何度も出た形）。
 * → **`useShortcut(SHORTCUTS.<id>` を呼んでいる部品**を探し、
 *   **その部品へ import で辿り着ける入口**（`app/(admin)/layout.tsx` と各 `page.tsx`）から決める。
 *
 *     layout から辿り着ける          → **global**（どの画面でも描かれる）
 *     特定の page からだけ辿り着ける → **page:<ルート>**
 *     どこからも辿り着けない         → 🚨 **unknown**（**"global" に倒さない**）
 *
 * 🚨 **`save` だけは、辿り着けるだけでは足りない。**
 *    `page-action.tsx` は全ページから辿れるが、ハンドラの中で
 *    `if (!form || role !== "primary" || …) return;` と**自分で降りる**。
 *    ＝ **`PAGE_ACTIONS` に「主要かつ submit」を宣言しているルートでしか効かない。**
 *    導出はそこまで見る（見ないと「全ページで ⌘Enter が効く」という嘘を出す）。
 *
 * ## 🚨 この出力が見ていない範囲
 *
 * ・**実際に押して効いたかは見ていない**（静的な導出だけ）。ブラウザで確かめるのは別の作業。
 * ・**入力欄の中の挙動**は `useShortcut` の `whileTyping` 次第で、ここには出していない。
 * ・**エディタ（Tiptap）が押さえている組み合わせ**は `check-shortcuts.mjs` の担当。
 *   ここは「OhMyCMS が登録しているもの」だけを出す。
 * ・🚨 **`useShortcut(` を名前で探している。** 別名で包まれたら見えなくなる（同日の実測より）。
 */

import { readFileSync, writeFileSync, mkdirSync, globSync, existsSync } from "node:fs";
import { readTracked, trackedGlob } from "./lib/tracked-files.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { stripComments } from "./strip-comments.mjs";
import { tiptapCombos } from "./tiptap-combos.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AS_JSON = process.argv.includes("--json");
// 🚨 **生成物は、更新しないと腐る**（今日の⑤「古くなったら鳴る」）。
//    → `--write` で書き、既定では**書いてあるものと突き合わせて、ずれていたら落とす**。
//    先例: `check-mcp-catalog.mjs`（**写しを置き、ずれたら落ちる検査を付ける**）。
const AS_WRITE = process.argv.includes("--write");
const SKILL_REF = resolve(root, "../../.claude/skills/ohmycms-mcp/references/shortcuts.md");
const log = (...a) => { if (!AS_JSON) console.log(...a); };

/**
 * 🚨 **この生成器は索引（git）から読む。作業ツリーからは読まない。**
 *
 * 由来: 2026-08-16。`--write` で作った写しに、**別のペインが編集中だった
 * `users-policy-manager.tsx` の状態**（`<PageAction>` が在った版）が入り、
 * その人が書き換えた瞬間に写しがずれて **CI と全員のコミットが止まった**。
 * ＝ 生成物が「そのとき誰かの手元にあった状態」に依存していた。
 *
 * 🚨 **索引から読めば、共有ツリーでも新しい clone でも同じ出力になる**
 *    （CI が測っているのは clean な worktree なので、そこと一致する）。
 * 🚨 未追跡（`null`）は **「まだ入っていない」として飛ばす**。空文字にしない
 *    （空にすると「中身が無いファイル」として数え、**見ていない 0** を作る）。
 */
function readSrc(file) {
  return readTracked(file);
}

/** `@/…` と相対の import を実ファイルへ解決する（外部パッケージは追わない）。 */
function resolveImport(spec, fromFile) {
  const raw = spec.startsWith("@/")
    ? resolve(root, spec.slice(2))
    : spec.startsWith(".")
      ? resolve(dirname(fromFile), spec)
      : null;
  if (!raw) return null;
  for (const suffix of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    if (existsSync(`${raw}${suffix}`)) return `${raw}${suffix}`;
  }
  return existsSync(raw) ? raw : null;
}

/** その入口から import で辿り着けるファイル一式（深さは切らない。循環は visited で止まる）。 */
function reachableFrom(entryFile) {
  const seen = new Set();
  const stack = [entryFile];
  while (stack.length > 0) {
    const file = stack.pop();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    let body;
    body = readSrc(file);
    if (body === null) continue; // 未追跡＝まだ入っていない
    for (const m of stripComments(body).matchAll(/from\s+"([^"]+)"/g)) {
      const next = resolveImport(m[1], file);
      if (next && !seen.has(next)) stack.push(next);
    }
  }
  return seen;
}

// ── ① SHORTCUTS（id → 組み合わせ） ───────────────────────────────────
const shortcutsFile = resolve(root, "components/admin/shortcuts.ts");
const shortcutsSrc = stripComments(readSrc(shortcutsFile) ?? "");
// 🚨 **表の終わりで切る。** 最初は `slice(tableAt)` で末尾まで見ていて、
//    後ろにある `KEY_SYMBOL`（`arrowleft: "←"` など）まで**ショートアップとして数えた**
//    （実測: 6 件のはずが 13 件。自己検査の「辞書キーが無い」で 7 件が落ちて気づいた）。
//    ＝ **範囲を切らない走査は、隣のものを拾う。**
const tableAt = shortcutsSrc.indexOf("export const SHORTCUTS");
const tableEnd = tableAt >= 0 ? shortcutsSrc.indexOf("} as const;", tableAt) : -1;
const table = tableAt >= 0 && tableEnd > tableAt ? shortcutsSrc.slice(tableAt, tableEnd) : "";
const combos = [...table.matchAll(/^\s{2}([A-Za-z_$][\w$]*):\s*"([^"]*)",/gm)]
  .map((m) => ({ id: m[1], key: m[2] }));

// ── ② 登録している部品（useShortcut(SHORTCUTS.<id>） ─────────────────
// 🚨 呼び出しは 1 行に収まらない（`useShortcut(\n  SHORTCUTS.save,` の形が実在する）。
//    行で探さず、**ファイル全体を 1 つの文字列として**見る。
const sources = trackedGlob("{app,components}/**/*.{ts,tsx}", { cwd: root })
  .map((rel) => resolve(root, rel));
// 🚨 **登録元は 1 つとは限らない。全部持つ。**
//    最初は `if (!registrar.has(id))` で**最初の 1 つだけ**を採っていて、
//    `submit` の登録元が 2 つ（bug-report-composer / report-thread）あることを落としていた。
//    ＝ **「1 つ見つけたら終わり」は、数を 1 に潰す。**（実測 2026-08-16）
const registrar = new Map(); // id → 登録している部品のパス（複数）
for (const file of sources) {
  const body = stripComments(readSrc(file) ?? "");
  for (const m of body.matchAll(/useShortcut\(\s*SHORTCUTS\.([A-Za-z_$][\w$]*)/g)) {
    const list = registrar.get(m[1]) ?? [];
    if (!list.includes(file)) list.push(file);
    registrar.set(m[1], list);
  }
}

// ── ③ 入口（layout と各 page）からの到達 ─────────────────────────────
const layoutFile = resolve(root, "app/(admin)/layout.tsx");
const layoutReach = existsSync(layoutFile) ? reachableFrom(layoutFile) : new Set();
const pages = trackedGlob("app/(admin)/**/page.tsx", { cwd: root })
  .map((rel) => ({
    route: `/${rel.replace(/^app\/\(admin\)\//, "").replace(/\/page\.tsx$/, "")}`,
    file: resolve(root, rel),
  }));
const pageReach = pages.map((p) => ({ ...p, reach: reachableFrom(p.file) }));

// ── ④ `save` の追加条件（PAGE_ACTIONS の「主要かつ submit」） ────────
const actionsSrc = stripComments(readSrc(resolve(root, "lib/admin/page-actions.ts")) ?? "");
const actionsTable = actionsSrc.slice(actionsSrc.indexOf("export const PAGE_ACTIONS"));
const submitRoutes = [];
for (const m of actionsTable.matchAll(/^ {2}"(\/admin[^"]*)": \[([\s\S]*?)^ {2}\],/gm)) {
  const [, route, block] = m;
  for (const entry of block.split(/\},\s*\{/)) {
    if (/kind:\s*"submit"/.test(entry) && /role:\s*"primary"/.test(entry)) {
      submitRoutes.push(route);
      break;
    }
  }
}

// ── ④-2 🚨 **`useFormSubmitShortcut` を呼んでいる画面**も `save` の範囲 ────────
// 由来: 2026-08-16（design の依頼・onboard が場所を特定）。
//   `PAGE_ACTIONS` に「主要かつ submit」を宣言していなくても、画面側が
//   `hooks/use-form-submit-shortcut.ts` を呼んでいれば ⌘Enter で保存が走る。
//   🚨 **この生成器はその口を知らなかった**ので、写しは「保存の鍵が効くルート」を
//   少なく出したまま**検査は緑**だった（＝ 今日の「集めたが誰も読まない」と同じ性質。
//   **緑だが、事実を写していない**）。
// 🚨 名前で探している（`useFormSubmitShortcut(`）。**別名で包まれたら見えない**——
//   この生成器の `useShortcut(` と同じ弱さで、冒頭の「見ていない範囲」に書いてあるとおり。
// 🚨 **0 件なら落とす**。2026-08-16 時点で 6 部品が呼んでいるので、0 は「見ていない 0」の合図。
const hookCallers = sources.filter((f) => /useFormSubmitShortcut\s*\(/.test(stripComments(readSrc(f) ?? "")));
if (hookCallers.length === 0) {
  problems.push(
    "`useFormSubmitShortcut(` を呼ぶ部品が **0 件**でした。🚨 2026-08-16 時点で 6 部品" +
      "（labels / policies / roles / users-policy / agents / policy-permissions）が呼んでいるので、" +
      "**探し方が壊れた合図**です。名前が変わっていないか確かめてください",
  );
}
const hookRoutes = pageReach
  .filter(({ reach }) => hookCallers.some((f) => reach.has(f)))
  .map((p) => p.route);
for (const r of hookRoutes) if (!submitRoutes.includes(r)) submitRoutes.push(r);

// ── ④b エディタの中で意味が変わるか（**Tiptap の抽出は shell の持ち物を import**） ──
// 🚨 **写さない。** 抽出を repo に 2 つ持つと、片方だけ直る（今日それを 1 本潰したばかり）。
// 🚨 **受け取る側でも確かめる**（守りを 1 点に置かない）。shell の守りは「入力の生表記」を
//    見ていて、**正規化が壊れると null 混じりの 18 件が渡る**ことが実測で分かっている。
const tiptap = tiptapCombos(); // 🚨 壊れていれば throw する。**握り潰さない**（⑤）
{
  const bad = [...tiptap.combos].filter((c) => typeof c !== "string" || c.trim() === "");
  if (bad.length > 0) {
    throw new Error(`tiptapCombos() が壊れた値を返しました（空/非文字列 ${bad.length} 件）`); // ①
  }
  if (tiptap.combos.size === 0) throw new Error("tiptapCombos() が 0 件です（衝突が無いのではなく、見ていない）"); // ④
  if (!tiptap.combos.has("mod+i")) throw new Error("tiptapCombos() に mod+i がありません（extension-italic 由来。取れないのは見ていない合図）"); // ②
  if (tiptap.combos.has("mod+shift+f13")) throw new Error("tiptapCombos() に在るはずのない組み合わせが入っています"); // ③ 対照(-)
}

// ── ⑤ 辞書キー ───────────────────────────────────────────────────────
const snake = (id) => id.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const dict = {};
for (const locale of ["ja", "en"]) {
  const p = resolve(root, `i18n/messages/${locale}/common.json`);
  dict[locale] = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};
}

// ── ⑥ 組み立て ───────────────────────────────────────────────────────
const manifest = combos.filter(({ key }) => key.length > 0).map(({ id, key }) => {
  const registrars = registrar.get(id) ?? [];
  const file = registrars[0] ?? null;
  let scope = "unknown";
  let scopeWhy = "登録している部品が見つかりません（useShortcut を名前で探しています）";
  if (file) {
    if (id === "save") {
      // 🚨 辿り着けるかではなく、**宣言があるルート**で決める（上のコメント参照）
      scope = submitRoutes.length > 0 ? submitRoutes.map((r) => `page:${r}`) : "unknown";
      scopeWhy =
        `PAGE_ACTIONS に「主要かつ submit」を宣言しているルート ＋ ` +
        `useFormSubmitShortcut を呼んでいる画面（${hookRoutes.length} 件）＝ 合わせて ${submitRoutes.length} 件`;
    } else if (registrars.some((f) => layoutReach.has(f))) {
      scope = "global";
      scopeWhy = "app/(admin)/layout.tsx から import で辿り着ける";
    } else {
      const routes = pageReach.filter((p) => p.reach.has(file)).map((p) => `page:${p.route}`);
      if (routes.length > 0) {
        scope = routes;
        scopeWhy = `${routes.length} 本の page.tsx から辿り着ける`;
      }
    }
  }
  // 🚨 **`scope` に "editor" を入れなかった理由**（司令塔の指示に対する差分。**判断を仰ぎます**）:
  //    `mod+b` は **global（サイドバー開閉）でもあり、エディタの中では太字**。
  //    `scope: "editor"` にすると「**エディタの中でしか効かない**」と読めて、**外での動きが消える**。
  //    → `scope` は導出のまま、**`editor` を別の欄**にして「中では何が起きるか」を出す。
  //    🚨 **エディタ専用のものが出てきたら、そのときは scope に "editor" を入れるべき**（いまは 0 件）。
  const inEditor = tiptap.combos.has(key);
  const editorSources = inEditor
    ? [...new Set((tiptap.sources.get(key) ?? []).map((x) => x.pkgName))]
    : [];
  const labelKey = `common.shortcut_${snake(id)}`;
  const key2 = `shortcut_${snake(id)}`;
  return {
    key,
    action: id,
    scope,
    label_key: labelKey,
    editor: inEditor ? { conflicts: true, owner: editorSources } : { conflicts: false },
    _why: scopeWhy,
    _label_exists: { ja: key2 in dict.ja, en: key2 in dict.en },
    _registrar: registrars.map((f) => f.replace(`${root}/`, "")),
  };
});

if (AS_JSON) {
  console.log(JSON.stringify(
    manifest.map(({ _why, _label_exists, _registrar, ...rest }) => rest), null, 2,
  ));
}

// ── ⑦ 自己検査（司令塔が決めた受入 4 点） ────────────────────────────
const problems = [];
const find = (id) => manifest.find((m) => m.action === id);

// ④ 導出が 0 件なら失敗（空の一覧を「全部 global」と読ませない）
if (combos.length === 0) problems.push("ショートカットを 1 つも読めませんでした（SHORTCUTS の書き方が変わった？）");

// 🚨 **増えた瞬間に穴が空く形にしない**（司令塔 2026-08-16）。
//    284 の原文は「なるべく多くのショートカットを用意する」＝ **増えるのが前提**。
//    増えたのに `scope` を導出できないものが出たら、**その場で落とす**。
//    （出すだけだと、増えた人は「unknown が 1 件」を読み飛ばす。**鳴らないと直らない**）
// 🚨 これは「書いただけ」ではなく「鳴る」形。
const noScope = manifest.filter((m) => m.scope === "unknown");
if (noScope.length > 0) {
  problems.push(
    `🚨 **scope を導出できないショートカットが ${noScope.length} 件あります**` +
      `（${noScope.map((m) => m.action).join(" / ")}）。` +
      "**\"global\" に倒さず、落としています。** " +
      "`useShortcut(SHORTCUTS.<id>` を呼ぶ場所が見つからないか、" +
      "**別名で包まれていて名前で探せません**（この導出は `useShortcut(` を名前で探しています）",
  );
}

// ① 既知の 1 つ: save は「編集する画面」にしか出ないはず
const save = find("save");
if (manifest.length > 0) {
  const saveOk = save && Array.isArray(save.scope) && save.scope.length > 0
    && save.scope.length < pages.length;
  if (!saveOk) {
    problems.push(
      `⌘Enter（save）の scope が ${JSON.stringify(save?.scope)}。` +
        `**編集する画面にだけ**出るはずで、全ページでも 0 件でもありません（導出が間違っています）`,
    );
  }
}
// ③ 対照: search は global
const search = find("search");
if (manifest.length > 0 && (!search || search.scope !== "global")) {
  problems.push(`⌘K（search）の scope が ${JSON.stringify(search?.scope)}。**global** のはずです`);
}
// ② 導出できないものは unknown のまま出ていること（global に倒していないこと）
const unknown = manifest.filter((m) => m.scope === "unknown");
// 辞書キーの実在
for (const m of manifest) {
  if (!m._label_exists.ja || !m._label_exists.en) {
    problems.push(`${m.action}: ${m.label_key} が ${!m._label_exists.ja ? "ja" : ""}${!m._label_exists.ja && !m._label_exists.en ? " と " : ""}${!m._label_exists.en ? "en" : ""} に無い`);
  }
}

log(`ショートカット ${manifest.length} 件 / 入口: layout 1 + page ${pages.length} 本`);
log(`  🟢 対照(+): search = ${JSON.stringify(search?.scope)}（global のはず）`);
log(`  🟢 対照(+): save   = ${Array.isArray(save?.scope) ? `${save.scope.length} ルート` : JSON.stringify(save?.scope)}（全 ${pages.length} ルートより少ないはず）`);
// 🚨 **0 の顔を書く**（司令塔 2026-08-16。0 には ①異常が無い ②見ていない ③落ちた ④まだ出番が来ていない、の 4 つ）。
//    ここの 0 は **①**: **6 件すべて導出できた**結果の 0 であって、「見ていない」ではない。
//    （**導出できないものが 1 件でも在れば落とす**ので、緑の 0 は「全部導出できた」を意味する）
log(`  ${unknown.length > 0 ? "🚨" : "  "} 導出できなかったもの（unknown・**global に倒していない**）: ${unknown.length} 件`
  + (unknown.length === 0 ? `（**${manifest.length} 件すべて導出できた 0**。見ていない 0 ではない）` : ""));
log("");
for (const m of manifest) {
  const scopeText = Array.isArray(m.scope) ? `${m.scope.length} ルート` : m.scope;
  log(`  ${m.action.padEnd(20)} ${m.key.padEnd(18)} ${String(scopeText).padEnd(12)} ${m._why}`);
  // 🚨 **拾った実物（どの部品が登録しているか）を必ず出す**（司令塔 2026-08-16）。
  //    これが無いと、"global" が何を根拠に出た値か、読んだ人が確かめられない。
  if (m.editor.conflicts) {
    log(`      🚨 エディタの中では別の働き: ${m.editor.owner.join(" / ")}（本文の入力中は、そちらが先）`);
  }
  log(`      登録元 ${m._registrar.length > 0 ? m._registrar.join(" / ") : "（見つからない）"}`
    + (m._registrar.length > 1 ? "  🚨 **2 つ以上ある**（どちらが描かれているかで効き方が変わる）" : ""));
  if (Array.isArray(m.scope)) for (const s of m.scope.slice(0, 3)) log(`      例 ${s}`);
}

// ── ⑦-b 🚨 **モードで出し分ける画面**（表示モード / 編集モード） ────────────────
// 由来: 2026-08-16、base2 が `/admin/files/[id]` を表示 / 編集モードに分けたところ、
//   写しから `page:/admin/files/[id]` が静かに落ちた。**そこで両方向に嘘が在ると分かった**:
//   ❌ 抜け  … 編集モードでは ⌘Enter が効くのに、写しには出ない
//   🚨 過剰 … `/admin/settings/general` `/admin/settings/sso` は写しに**在る**が、
//             【私が台で測った】表示モードで ⌘Enter → submit **0** ／
//             「編集する」を押してから → submit **1**（form=settings-form / saml-settings-form）
//             ＝ **開いた直後は効かない**のに「効く」と書いてある
// 🚨 直せない理由: 導出元の `PAGE_ACTIONS` は **1 ルート＝1 組**で、状態で入れ替わるものを表せない
//   （base2 が同表のコメントに明記）。ここで `#editing` を書くと**推測を写しに載せる**ことになる。
//   → **嘘を消すのでなく、「見ていない」を見えるようにする**。表にモードの欄が入ったら導出に直す。
// 🚨 この一覧の作り方: 各ルートの到達先に「編集する」ボタン（`action_edit` のラベル）が在るか。
//   `lib/admin/page-actions.ts` は宣言の表なので**除く**（そこにも同じ鍵が出るため）。
const modeSplit = pageReach
  .filter(({ reach }) =>
    [...reach].some(
      (f) => !f.endsWith("lib/admin/page-actions.ts") && /\("action_edit"\)/.test(readSrc(f) ?? ""),
    ),
  )
  .map((p) => p.route)
  .sort();
// ── ⑦-c 🚨 **押せる状態でないと効かない画面**（`disabled` で止めている保存） ──────
// 由来: 2026-08-16。私が「`/admin/settings/storage` は編集モードでも ⌘Enter が効かない」と
//   base2 へ渡したところ、**不具合ではなかった**。`disabled={!dirty}` ＝ **変更が無ければ保存させない**。
//   base2 の実測: 値を 1 つ変えてから ⌘Enter → submit 1 件 + `/api/settings PATCH`（横取りして停止）。
//   🚨 **`page-action.tsx` は `disabled` をショートカット側でも見ている**
//      （「押せないボタンの働きを鍵から起こさない」）ので、**ボタンが押せない＝⌘Enter も効かない**。
// 🚨 ＝ この画面で効くかは **モードだけでは決まらない**（「変更が在るか」でも変わる）。
//   `#editing` のような形を入れても、**これだけでは足りない**（base2 の指摘）。
// 🚨 拾い方: 到達先の `<PageAction … />` のうち **`role="primary"` かつ `form=` を持つ**ものに
//   `disabled=` が在るか。**`/>` は行頭のものだけを終端に使う**
//   （`icon={<Check />}` の `/>` を終端にすると、その後ろの `disabled` を取りこぼす）。
const gatedSave = pageReach
  .map(({ route, reach }) => {
    const conds = [];
    for (const f of reach) {
      if (f.endsWith("lib/admin/page-actions.ts")) continue;
      for (const m of (readSrc(f) ?? "").matchAll(/<PageAction\b[\s\S]*?^\s*\/>/gm)) {
        const b = m[0];
        if (!/role="primary"/.test(b) || !/\bform=/.test(b)) continue;
        const d = b.match(/\bdisabled=\{([^}]*)\}/);
        if (d) conds.push(d[1].trim());
      }
    }
    return { route, conds: [...new Set(conds)] };
  })
  .filter((x) => x.conds.length > 0)
  .sort((a, b) => a.route.localeCompare(b.route));
// 🚨 **0 の顔**: 0 なら「どこも止めていない」のか「拾い方が壊れた」のか区別できない。
//   2026-08-16 時点で `disabled={!dirty}`（storage）/ `{!ready}`（sso）が実在するので **0 は失敗**。
if (gatedSave.length === 0) {
  problems.push(
    "保存を `disabled` で止めている画面が **0 件**でした。🚨 2026-08-16 時点で実在する" +
      "（`storage-settings-manager` の `disabled={!dirty}` / `saml-settings-manager` の `disabled={!ready}`）ので、" +
      "**拾い方が壊れた合図**です。`<PageAction` の書き方が変わっていないか確かめてください",
  );
}

// 🚨 **0 の顔**: ここが 0 なら「分割された画面がまだ無い」のか「探し方が壊れた」のか区別できない。
//   分割は 2026-08-16 時点で実在する（4 枚を目視で確認済み）ので、**0 は失敗として扱う**。
if (modeSplit.length === 0) {
  problems.push(
    "モードで出し分ける画面が **0 件**でした。🚨 2026-08-16 時点で実在する（`settings-manager` / " +
      "`saml-settings-manager` / `file-detail-manager` / `profile-settings`）ので、**探し方が壊れた合図**です。" +
      "『編集する』のラベル鍵が変わっていないか確かめてください",
  );
}

// ── ⑧ Skills へ渡す生成物（**ここが「Skills で伝わるように」の実体**） ──────────
// 🚨 堀池さん 2026-08-15:「AI が Chrome 拡張などでサイトを操作する時、活用する。
//    （**Skills・MCP で伝わるように**）」
//    🚨 **操作するのは Chrome 拡張。ここは「押し方を教える」側**（押させない）。
{
  const body = manifest.map(({ _why, _label_exists, _registrar, ...rest }) => rest);
  const doc = [
    "# OhMyCMS のキーボードショートカット",
    "",
    "🚨 **このファイルは生成物です。手で直さないでください。**",
    "元は `apps/studio/components/admin/shortcuts.ts` の `SHORTCUTS`。",
    "作り直し: `cd apps/studio && node scripts/build-shortcuts-manifest.mjs --write`",
    "（ずれていると同じスクリプトが `exit 1` で落ちます）",
    "",
    "## 読み方",
    "",
    "- `key` … **記号ではなく組み合わせ**（`mod` は macOS の ⌘ / それ以外は Ctrl）。",
    "  🚨 記号は**プラットフォームで変わる**ので、受け取った側で決めてください。",
    "- `scope` … `global`（管理画面のどこでも）／ `page:<ルート>`（その画面だけ）／ `unknown`。",
    "  🚨 `global` は「**登録している部品が layout から辿れる**」の意味で、",
    "  **「いつでも効く」ではありません**（例: `submit` は入力欄が開いている間だけ）。",
    "- `editor` … 🚨 **本文エディタ（Tiptap）の中では別の働きをする**もの。",
    "  `owner` がその働きを持つパッケージ。**本文の入力中は、そちらが先です。**",
    "- `label_key` … 画面に出す名前の辞書キー（ja / en の両方に在ることを検査で確かめています）。",
    "",
    "```json",
    JSON.stringify(body, null, 2),
    "```",
    "",
    "## 🚨 この一覧が見ていない範囲：**モードで出し分ける画面**",
    "",
    "下の画面は「表示モード」と「編集モード」に分かれていて、**開いた直後は保存できません**",
    "（「編集する」を押してから保存できるようになります）。",
    "🚨 **この一覧は表示モードの状態しか見ていません。** そのため:",
    "",
    "- 保存が編集モードにしか無い画面は、`save` の `scope` に**出ません**（効かないように見えます）",
    "- 逆に `scope` に出ていても、**開いた直後は効きません**（「編集する」を押すまで）",
    "",
    `🚨 **該当する画面は ${modeSplit.length} 件**（0 件なら探し方が壊れています。この生成器が落ちます）:`,
    "",
    ...modeSplit.map((r) => `- \`${r}\``),
    "",
    "実測（2026-08-16・ヘッドレスで送信を横取りして止めた状態）:",
    "`/admin/settings/general` は表示モードで ⌘Enter → 送信 **0 件**、",
    "「編集する」を押してから ⌘Enter → 送信 **1 件**（`settings-form`）。",
    "🚨 **元になっている表（`PAGE_ACTIONS`）がモードを表せない**ため、ここは導出できません。",
    "表にモードの欄が入り次第、この節は導出に置き換わります。",
    "",
    "## 🚨 さらに：**押せる状態でないと効かない**画面",
    "",
    "保存ボタンが `disabled` のとき、**⌘Enter も効きません**",
    "（`page-action.tsx` がショートカット側でも `disabled` を見ているため。",
    "「押せないボタンの働きを鍵から起こさない」）。",
    "🚨 **モードだけでなく「保存できる状態か」でも変わります。**",
    "",
    `🚨 **保存を止めている画面は ${gatedSave.length} 件**（0 件なら拾い方が壊れています。この生成器が落ちます）:`,
    "",
    ...gatedSave.map((g) => `- \`${g.route}\` … 押せない条件: ${g.conds.map((c) => `\`${c}\``).join(" / ")}`),
    "",
    "実測（2026-08-16）: `/admin/settings/storage` は編集モードでも**何も変えなければ** ⌘Enter で",
    "送信 **0 件**。値を 1 つ変えると送信 **1 件**（`storage-settings-form`）。",
    "🚨 **「効かない」ではなく「保存できる状態のときだけ効く」**です。",
    "🚨 こちらは**条件式ごと導出しています**（上のモードの節と違い、推測ではありません）。",
    "",
    "## 🚨 本文エディタが押さえている組み合わせ（**割り当ててはいけない側**）",
    "",
    "本文（Tiptap）の中では、下の組み合わせは**エディタの働き**になります。",
    "🚨 **新しいショートカットを割り当てるときは、ここと被らせないでください。**",
    "被らせると「入力欄の外では効いて、中では効かない」という**説明できない挙動**になります。",
    "",
    "出どころは `apps/studio/scripts/tiptap-combos.mjs`（`node_modules` の Tiptap から抽出）。",
    `🚨 **動的に決まるものが ${tiptap.dynamic?.length ?? 0} 件、読めなかったパッケージが ${tiptap.skipped?.length ?? 0} 件あります**` +
      "（＝ **この一覧は下限です**）。",
    "",
    "| 組み合わせ | どの働きか（パッケージ） |",
    "| --- | --- |",
    ...[...tiptap.combos].sort().map((c) => {
      const owners = [...new Set((tiptap.sources.get(c) ?? []).map((x) => x.pkgName))];
      return `| \`${c}\` | ${owners.join(" / ") || "（出所不明）"} |`;
    }),
    "",
  ].join("\n");

  if (AS_WRITE) {
    mkdirSync(dirname(SKILL_REF), { recursive: true });
    writeFileSync(SKILL_REF, doc, "utf8");
    log(`\n✍️ 書きました: ${SKILL_REF.replace(`${root}/../../`, "")}`);
  } else if (!existsSync(SKILL_REF)) {
    problems.push(
      `Skills 側の生成物がありません（${SKILL_REF}）。` +
        "🚨 **「Skills で伝わるように」の実体がこれです。** `--write` で作ってください",
    );
  } else if (readFileSync(SKILL_REF, "utf8") !== doc) {
    problems.push(
      "🚨 **Skills 側の生成物が、いまの SHORTCUTS とずれています**。" +
        "`node scripts/build-shortcuts-manifest.mjs --write` で作り直してください" +
        "（**手で直さない**。元は `components/admin/shortcuts.ts`）",
    );
  } else {
    log(`  🟢 Skills 側の生成物と一致（${SKILL_REF.split("/.claude/")[1] ?? SKILL_REF}）`);
  }
}

if (problems.length > 0) {
  console.error(`\n🚨 ${problems.length} 件（この一覧は信用できません）:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
// 🚨 **"global" の意味を、出力で断っておく。**
//    ここでの global は「**登録している部品が layout から辿れる**」であって、
//    「**いつでも効く**」ではない。実例: `submit` は `bug-report-composer` / `report-thread` が
//    登録しており、**その入力欄が開いている間しか効かない**。静的には区別できないので、
//    ここでは断り書きにしている（区別が要るなら "editor" 相当の値を足す判断が要る）。
log("\n🚨 この一覧の \"global\" は「登録している部品が layout から辿れる」という意味です。");
log("   **「いつでも効く」ではありません**（例: submit は入力欄が開いている間だけ）。");
log("   区別が要るなら、`scope` に \"editor\" 相当を足すかどうかの判断が要ります。");
log("\n問題なし（上の導出を実際に辿った結果）");
