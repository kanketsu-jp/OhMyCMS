#!/usr/bin/env node
/**
 * 面（Surface）の深さと寸法を、**実際に描画された画面から**測る。
 *
 * 🚨 なぜ静的検査（check-surface-nesting.mjs）と別に要るか:
 *
 *   静的検査はファイル1本ずつを見るので、**組み合わせで生まれる面**を原理的に検出できない。
 *   面の深さは「layout.tsx + page.tsx + components/**」が合成された結果で決まる。
 *   実際、堀池さんの指摘（2026-08-13）は「個々の部品は正しいのに、組み合わせが3段」だった。
 *
 *   さらに静的検査は次を見られない:
 *     ・Tailwind のクラスが最終的にどの色に解決されたか（bg-muted/40 が親と同じ色なら面ではない）
 *     ・ボタンと入力の**実 px**（憲章 §3「同じ行に並ぶ操作は高さを揃える」）
 *     ・SP でナビが1つも表示されていないこと（憲章 §7）
 *     ・スクロールが実際に発生しているか（憲章 §6 の scroll-fade の対象かどうか）
 *
 *   → 両方を通すこと。静的は速くて全ファイル、こちらは遅いが真実。
 *
 * 依存パッケージ 0 本。Node の組み込み（fetch / WebSocket / child_process）と Chrome だけを使う。
 *
 * 使い方:
 *   node scripts/audit-surface-depth.mjs --base http://localhost:3103 --session <cookie値>
 *   node scripts/audit-surface-depth.mjs --base http://localhost:3101 --paths /login
 *   node scripts/audit-surface-depth.mjs --json > audit.json
 *
 * セッションの取り方（dev-login が有効なインスタンスのみ。本番ビルドはコードごと消えている）:
 *   curl -sS -X POST '<base>/api/auth/dev-login?admin=true' -H 'content-type: application/json' \
 *     -d '{"email":"admin@local"}' -c /tmp/c.txt && grep session /tmp/c.txt | awk '{print $NF}'
 *
 * 終了コード: 違反があれば 1。CI や lefthook から落とせる。
 */

import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

// ── 引数 ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(`--${name}`);

const BASE = arg("base", process.env.AUDIT_BASE ?? "http://localhost:3103");
const SESSION = arg("session", process.env.AUDIT_SESSION ?? "");
const SHOTS = arg("shots", "");
const MAX_DEPTH = Number(arg("max-depth", "1"));
const AS_JSON = has("json");
const PORT = Number(arg("cdp-port", "0"));  // 0 = 空きポートを OS に選ばせる
const HAS_EXPLICIT_PATHS = arg("paths", "").length > 0;
// 🚨 発見の段が「赤を出せるか」を見る陽性対照用。
//    通常の監査には混ぜない。--paths 明示時は発見の段ごと走らない。
const DISCOVERY_POSITIVE_CONTROL = has("discovery-positive-control");
// 🚨 開いている間しか存在しない箱（select の候補・command のリスト・dialog / sheet の本文）を測るための入口。
//    ページを開いただけでは DOM に無いので、**測る前にこれを押す**。
//    例: --click '[data-slot=global-search-trigger]'
const CLICK = arg("click", "");
// 🚨 --clipboard … --click 後に実際の clipboard を読む。
//    「押せた」「✓ が出た」はコピーできた証拠ではないので、ブラウザが読んだ値を出す。
//    付けていないときは、既存の出力を 1 バイトも変えない。
const CLIPBOARD = has("clipboard");
const CLIPBOARD_SENTINEL = "__OHMYCMS_AUDIT_CLIPBOARD_EMPTY__";
const CLIPBOARD_PREVIEW_CHARS = 500;
const MEASURE = arg("measure", "");
// 🚨 --dump … 測ったあとの画面の中身を出す。
//    「深さ=0 / ナビ=0 / 書体=Times」のように**壊れているのに数字だけ出る**とき、
//    何が起きたのかが分からず止まる（2026-08-14 実測）。数字の裏に画面を貼れるようにする。
const DUMP = process.argv.includes("--dump");
// 🚨 --file <パス> … 隠れている <input type="file"> に実際のファイルを載せてから測る。
//    由来: 2026-08-14。FileDropzone は**選んだあとだけ** `Attachment` を描き、
//    その Attachment は `rounded-xl border bg-card` = **面**。
//    監査は一度もファイルを選ばないので、**選んだあとの面の深さを一度も見ていなかった**。
//    「違反なし」が「選ぶ前について」しか言っていない状態だった。
const FILE = arg("file", "");
// 🚨 --keys 'ArrowDown,ArrowDown,Escape' … 開いたあとに実際にキーを押し、
//    **焦点がどこへ移ったか**を出す。今夜、ユーザーメニューの ↑↓ が動かない不具合が
//    「押してみた人」にしか見つけられなかった（監査は寸法と面しか見ていなかった）。
//    焦点が1度も動かなければ違反に数える。
const KEYS = arg("keys", "");
// 🚨 測る言語。既定は ja（**利用者が見ている画面**）。headless の既定 en のままにしない。
const LOCALE = arg("locale", "ja");
const KEYCODE = { ArrowDown: 40, ArrowUp: 38, Escape: 27, Enter: 13, Tab: 9, Home: 36, End: 35 };
// 🚨 描画生存確認の本文しきい値。
//    これは nav a 等の代理ではなく、利用者が見る本文そのもの（body.innerText）を測る。
//    2026-08-15 実測（ja / http://localhost:3102 / 通常18ページ）:
//      最小 70 文字（sp /admin/files/new-folder）、最大 9044 文字。
//    陽性対照:
//      空HTML: 0文字・title空、例外ページ: 2文字・Runtime.exceptionThrown。
//    正常最小 70 と壊れた最大 2 の間が十分に開いているので、境界を 40 に置く。
const MIN_RENDER_TEXT_CHARS = 40;

const DEFAULT_PATHS = [
  // 🚨 /admin は /admin/collections へ転送される（2026-08-14・⑰ でホームを廃止）。
  //    転送されると「測定不能」になるので、着地先を直接指定する。
  // 🚨 2026-08-14: **7 ページしか見ていなかった**（実在するのは 22 ページ）。
  //    最初に外れていたページ（/admin/collections/<id>）を測ったら、
  //    **堀池さんが指摘したのと同じ「区切りの重複」が3箇所**出た。
  //    「違反なし」は**ここに並んでいるパスについてだけ**の話。**足すのは見つけた人の仕事**。
  //    実在するページの一覧: find 'app/(admin)' -name page.tsx
  //    🚨 [ ] を含むページ（コレクション・アイテム・ファイル詳細）は**実データの id が要る**ので
  //       ここには書けない。**--paths で必ず別途測ること**（下の DYNAMIC_HINT を読む）。
  "/admin/collections",
  "/admin/collections/new",
  "/admin/files",
  "/admin/files/new-folder",
  "/admin/reports",
  "/admin/settings/agents",
  "/admin/settings/roles",
  "/admin/settings/sso",
  "/admin/settings/version",
  // 🚨 /admin/folders は 2026-08-14 に /admin/files へ統合され、恒久転送になった
  //    （堀池さん「この二つはどう違うのかわからない」）。**測る対象ではない**ので外す。
  //    転送が生きているかは受入側で curl の実測を貼ること。
  "/admin/files/new",
  // 🚨 2026-08-15 追加。**実在して HTTP 200 なのに、一度も巡回していなかった 5 本。**
  //    手書きの一覧だったので、ページが増えても勝手には入らなかった。
  //    測った瞬間 /admin/profile に違反 4 件（レイアウトが潰れている・入力 736px ほか）。
  //    守り手: scripts/check-audit-coverage.mjs（実在するのに巡回外なら落ちる）。
  "/admin/labels",
  "/admin/profile",
  "/admin/reports/manage",
  "/admin/settings/mcp",
  "/admin/settings/storage",
  "/admin/notifications",
  "/admin/settings/general",
  "/admin/settings/policies",
  "/admin/settings/users",
];
let PATHS = HAS_EXPLICIT_PATHS
  ? arg("paths", "").split(",").map((s) => s.trim()).filter(Boolean)
  : DEFAULT_PATHS;

// 🚨 動的ルートは DEFAULT_PATHS に直書きできない（実データの id が要る）。
//    だから「測れなかった」を黙らせず、実際の一覧ページの href から拾って 1 種類 1 本だけ足す。
const DISCOVERY_LIST_PATHS = [
  "/admin/collections",
  "/admin/files",
  "/admin/reports",
  "/admin/settings/policies",
];
const DYNAMIC_ROUTE_PATTERNS = [
  {
    label: "/admin/collections/[collection]/fields/new",
    source: "/admin/collections の href に詳細ページ内リンクが無ければ見つからない",
    re: /^\/admin\/collections\/(?!new(?:\/|$))[^/]+\/fields\/new$/,
  },
  {
    label: "/admin/collections/[collection]",
    source: "/admin/collections の href",
    re: /^\/admin\/collections\/(?!new(?:\/|$))[^/]+$/,
  },
  {
    label: "/admin/content/[collection]/[id]",
    source: "/admin/collections の href から辿れる content 導線（アイテム id が href に出ている場合のみ）",
    re: /^\/admin\/content\/[^/]+\/(?!new(?:\/|$))[^/]+$/,
  },
  {
    label: "/admin/content/[collection]/new",
    source: "/admin/collections の href から辿れる content 導線",
    re: /^\/admin\/content\/[^/]+\/new$/,
  },
  {
    label: "/admin/content/[collection]",
    source: "/admin/collections の href",
    re: /^\/admin\/content\/[^/]+$/,
  },
  {
    label: "/admin/files/[id]",
    source: "/admin/files の href",
    re: /^\/admin\/files\/(?!new(?:\/|$)|new-folder(?:\/|$))[^/]+$/,
  },
  {
    label: "/admin/reports/[id]",
    source: "/admin/reports の href",
    re: /^\/admin\/reports\/(?!manage(?:\/|$))[^/]+$/,
  },
  {
    label: "/admin/settings/policies/[id]",
    source: "/admin/settings/policies の href",
    re: /^\/admin\/settings\/policies\/[^/]+$/,
  },
];
if (DISCOVERY_POSITIVE_CONTROL) {
  DYNAMIC_ROUTE_PATTERNS.push({
    label: "/__audit_positive_control__/[id]",
    source: "--discovery-positive-control で一時的に混ぜた存在しないパターン",
    re: /^\/__audit_positive_control__\/[^/]+$/,
  });
}

// 🚨 素の CSS がモバイル、min-width で広げるのが規約（憲章 §7）なので SP を先に測る。
const VIEWPORTS = [
  { name: "sp", width: 390, height: 844, mobile: true, dsf: 2 },
  { name: "pc", width: 1440, height: 900, mobile: false, dsf: 1 },
];

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => { if (!AS_JSON) console.log(...a); };

// ── 画面の中で走らせる測定器 ────────────────────────────────────────────
// 🚨 ここが本体。「面」を**クラス名でなく描画結果**で判定する。
const PROBE = String.raw`(() => {
  const px = (v) => parseFloat(v) || 0;
  const clear = (c) => !c || c === "transparent" || /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(c);

  const sel = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    const slot = el.getAttribute("data-slot");
    if (slot) s += "[" + slot + "]";
    const cls = (el.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 5).join(".");
    if (cls) s += "." + cls;
    return s.slice(0, 160);
  };

  // 🚨 「描かれているか」は要素自身の display だけでは判定できない。
  //    祖先が display:none でも、**子の computed display は none にならない**（rect だけ 0 になる）。
  //    その結果、SP 専用で PC では隠している要素が「幅が0＝潰れている」と誤報される（2026-08-13 base2 の指摘）。
  //    checkVisibility() は祖先まで遡って見るので、これを使う。
  const shown = (el) => (typeof el.checkVisibility === "function"
    ? el.checkVisibility()
    : (() => { const s = getComputedStyle(el); return s.display !== "none" && s.visibility !== "hidden"; })());

  const srOnly = (el) => {
    // 🚨 **1辺 4px 以下の箱は「隠してある」であって「小さすぎる操作部品」ではない。**
    //    指では絶対に押せないので、押す対象として作られていない。
    //    2026-08-14 実測: FileDropzone の隠し <input type="file" class="sr-only"> が
    //    「1px しかない」と報告された。**隠すのが正解の実装**（見えている箱で受ける）。
    //    clip / clip-path を見るだけでは、隠し方の流儀が変わるたびに漏れる（技法に依存しない形にする）。
    //    🚨 潰れた部品を見逃す心配は要らない。**潰れは別の検査（幅が0・文字が縦積み）が見ている**。
    const r0 = el.getBoundingClientRect();
    if (r0.width <= 4 && r0.height <= 4) return true;
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.clipPath !== "none" || cs.clip !== "auto") return true;
    }
    return false;
  };

  // 🚨 **原則: 面とは「中身を入れる入れ物」**。入れ物でないものは、塗られていても面ではない。
  //    ここを場当たりで足していくと例外だらけになるので、**3種類に分類して**扱う。
  //
  //  ① 入力欄   … 面の中では罫線を捨てて塗りで区別するのが正解（憲章 §1）
  const FORM = "input,select,textarea,[data-slot=input-group],[data-slot=command-input]";
  //  ② 操作部品 … 部品として罫線も塗りも持ってよい。ただし中身を抱えたら「押せるカード」＝入れ物
  const ACTION = "button,a,summary,label," +
    "[role=option],[role=tab],[role=menuitem],[role=switch],[role=radio],[role=checkbox],[role=combobox]";
  //  ③ 標識     … ⌘K のキー表示・バッジ・インラインコード。文字を飾るだけで何も入れない
  const INDICATOR = "kbd,code,mark,[data-slot=badge],[data-slot=kbd]";

  // 🚨 影は「見えているか」で判定する。
  //    Tailwind は影が無くても box-shadow に**変数スタック**を置くので、
  //    boxShadow !== none だけで見ると**見えない影を面と数える**（2026-08-13 base2 の指摘。input-group が面2になった）。
  //    各レイヤーを見て「色が透明でない」かつ「ぼかし・広がり・ずれのどれかが 0 でない」ものが
  //    1つでもあれば、見える影とする。
  const visibleShadow = (v) => {
    if (!v || v === "none") return false;
    for (const layer of v.split(/,(?![^(]*\))/)) {
      const color = /(rgba?|oklab|oklch|hsla?)\([^)]*\)/.exec(layer)?.[0] ?? "";
      const transparent = /(\/\s*0\s*\)|,\s*0\s*\)$)/.test(color) || /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(color);
      if (transparent) continue;
      const lengths = (layer.replace(color, "").match(/-?\d*\.?\d+px/g) ?? []).map(parseFloat);
      if (lengths.some((n) => n !== 0)) return true;
    }
    return false;
  };

  // 面 = 「可視の囲み罫線」「影」「親と違う背景」のいずれかを持つ、十分な大きさの箱。
  // 🚨 1px の hr（Divider）や下線だけの箱は面に数えない。区切りは面ではないため（憲章 §1）。
  const asSurface = (el, parentBg) => {
    const s = getComputedStyle(el);
    if (!shown(el)) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 16) return null;

    const sides = ["Top", "Right", "Bottom", "Left"];
    const widths = sides.map((d) => px(s["border" + d + "Width"]));
    const colors = sides.map((d) => s["border" + d + "Color"]);
    const visible = widths.map((w, i) => w > 0 && !clear(colors[i]));
    const kinds = [];
    // 4辺すべてに罫線があるときだけ「囲み」= 面。1〜3辺は Divider 扱い。
    if (visible.every(Boolean)) kinds.push("border");
    if (visibleShadow(s.boxShadow)) kinds.push("shadow");
    if (!clear(s.backgroundColor) && s.backgroundColor !== parentBg) kinds.push("bg");
    if (!kinds.length) return null;

    // 🚨 **面は「入れ物」。操作部品の塗りは面ではない。**
    //
    // これを区別しないと、**規則が正解としている実装が違反として出てしまう**:
    //   ・入力欄の塗り … 堀池（2026-08-13 原文）「もし、ボーダーのなかにボーダーの Input タグを
    //     入れたくなったら、**Input タグのボーダーを消して、背景色を bg-zinc-100 などにする**」
    //     → 面の中の入力は「罫線を外して塗る」のが**正解**（憲章 §1・surface.tsx の自動降格もこれ）
    //   ・選択中の薄い塗り … Coinbase の手本「選択中 = 薄い塗り + チェック。ボーダーで囲まない」（憲章 §3b）
    //
    // 正解を違反と言う検査は使われなくなるので、ここは厳密に除外する。
    //
    // コードで明示的に「ここは面でよい」と宣言した箱（画像の受け皿など）。
    // 🚨 検査側に例外リストを隠さない。**例外はコードに書いて見えるようにする**。
    if (el.hasAttribute("data-surface-exempt")) return null;

    // ① 入力欄 … **塗りだけなら面ではない**（それが正解の形）。
    //    🚨 罫線を持っていたら面として報告する（面の中で罫線と塗りの両方は禁止）。
    //    🚨 子の数で判定しないこと。<select> は <option> を子に持つので必ず外れる（実測で踏んだ）。
    if (el.matches(FORM)) {
      if (kinds.length === 1 && kinds[0] === "bg") return null;
      return { kinds, bg: s.backgroundColor, pad: sides.map((d) => px(s["padding" + d])) };
    }

    // ② 操作部品 … 部品なので罫線も塗りも持ってよい。
    //    ただし**中身を抱えていたら「押せるカード」＝入れ物**なので面として扱う
    //    （files/page.tsx の <Link> で画像とテキストを抱えている形がこれ）。
    //
    // 🚨 **塗りだけなら、子の数によらず面ではない。**
    //    憲章 §1 が「選択中の薄い塗り・hover の塗りは面ではない」と決めているため。
    //    2026-08-14 実測: ユーザー行の引き金（アバター + 文字 + 矢印 = 子3つ）が
    //    開いている間の塗りで面レベル2として出た。**手本どおりの正しい実装**であり、
    //    塗りだけの箱が「入れ物」に見えることはない。罫線・影のときだけ子の数で見る。
    if (el.matches(ACTION)) {
      if (kinds.length === 1 && kinds[0] === "bg") return null;
      if (el.children.length <= 2) return null;
    }

    // ③ 標識 … 文字を飾るだけの小さな箱。要素を1つも抱えず、行の高さに収まるものに限る。
    //    大きさで縛るので「badge のふりをした入れ物」は通らない。
    if (el.matches(INDICATOR) && el.children.length === 0 && r.height <= 28) return null;

    return { kinds, bg: s.backgroundColor, pad: sides.map((d) => px(s["padding" + d])) };
  };

  const nested = [];
  let maxDepth = 0;
  (function walk(el, depth, parentBg) {
    let d = depth, bg = parentBg;
    const k = asSurface(el, parentBg);
    if (k) {
      d = depth + 1;
      bg = k.bg;
      if (d > maxDepth) maxDepth = d;
      if (d >= 2) {
        const r = el.getBoundingClientRect();
        nested.push({
          depth: d, sel: sel(el), kinds: k.kinds, pad: k.pad,
          size: [Math.round(r.width), Math.round(r.height)],
        });
      }
    }
    for (const c of el.children) walk(c, d, bg);
  })(document.body, 0, getComputedStyle(document.body).backgroundColor);

  // 🚨 **要素を持ち回る。寸法の配列を「同じ順で並んでいるはず」で突き合わせない。**
  //    由来: 2026-08-14。measure が間引いた一方で withTarget が別途 querySelectorAll し直しており、
  //    **添字がずれて、別の要素の高さを報告した**（隠し select が 1px として §7 に出た）。
  //    2つの経路で同じものを数えたら、必ずずれる。これも「代理を測らない」の一例。
  const keep = (el) => el.getBoundingClientRect().height > 0 && shown(el) && !srOnly(el);
  const pick = (q) => [...document.querySelectorAll(q)].filter(keep);
  const toItem = (el) => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return {
      sel: sel(el), h: Math.round(r.height * 10) / 10, w: Math.round(r.width),
      fs: Math.round(px(s.fontSize) * 10) / 10,
      label: (el.textContent || el.getAttribute("placeholder") || el.type || "").trim().slice(0, 20),
      // 🚨 sel だけだと**どこの何か分からず直せない**（読み上げ名の検査で同じことを踏んだ）。
      //    寸法の違反にも実物の断片を添える。
      html: el.outerHTML.replace(/\s+/g, " ").slice(0, 100),
    };
  };

  const buttonEls = pick("button, [data-slot=button]");
  const inputEls = pick("input:not([type=hidden]), select, textarea");
  const buttons = buttonEls.map(toItem);
  const inputs = inputEls.map(toItem);

  // 🚨 タップ領域は「ポインタ操作を受け付ける**領域**」で測る。部品の見た目の箱ではない。
  //    WCAG 2.2 SC 2.5.8 の target の定義（一次情報）:
  //      "region of the display that will accept a pointer action,
  //       such as the interactive area of a user interface component."
  //    → チェックボックスやラジオは、**関連づけられた label を押しても操作できる**ので、
  //      label の領域も target に含まれる。つまみ自体を 44px にする必要はない。
  //    由来: 2026-08-14 saml の指摘。size-6(24px) のつまみを min-h-11(44px) の label で包む実装を、
  //          監査が「24px」と報告していた（**正しい実装を違反と言っていた**）。
  const targetHeight = (el) => {
    let label = el.closest("label");
    if (!label && el.id) {
      try { label = document.querySelector("label[for='" + CSS.escape(el.id) + "']"); } catch { label = null; }
    }
    const own = el.getBoundingClientRect().height;
    if (!label) return own;
    return Math.max(own, label.getBoundingClientRect().height);
  };
  const withTarget = (els) =>
    els.map((el) => ({ ...toItem(el), h: Math.round(targetHeight(el) * 10) / 10 }));
  // 🚨 「ボタンが入力より高くならないこと」は**同じフォームの中**の話。
  //    2026-08-15 に憲章 §3 が反転したため。旧: ボタンは入力より低い。
  //    新規律では同じ高さは正しいので、button > input のときだけ違反にする。
  //    ページ全体の最大同士を比べると、別の場所にある lg のボタンと別の入力が比較され、
  //    **正しい実装を違反と報告する**（2026-08-14 実測。トークンは正しく分離されていた）。
  //    → **同じ form の中だけで比べる。** これも「代理を測らない」の一例。
  const formPairs = [];
  for (const form of document.querySelectorAll("form")) {
    const bs = [...form.querySelectorAll("button, [data-slot=button]")]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.height > 0 && r.width < e.parentElement?.getBoundingClientRect().width * 0.9; })
      .map((e) => Math.round(e.getBoundingClientRect().height));
    const is = [...form.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea")]
      // 🚨 1px の隠し入力と比べない（2026-08-15 実測の誤検出）。
      //    ファイル選択のダイアログを開いて測ったら button 36 / input 1 が出た。
      //    type=file は sr-only で 1px に潰して置くのが定石なので、
      //    正しい実装を「ボタンが入力より高い」と報告していた。
      //    しきい値 4px は上の「隠し要素の判定」と同じ値に揃えてある（別々の数字を作らない）。
      //    🚨 この関数はブラウザへ送るテンプレートリテラルの中なので、
      //       コメントにもバッククォートを書かないこと（文字列が途中で終わって構文エラーになる）。
      .filter((e) => { const r = e.getBoundingClientRect(); return r.height > 4 && r.width > 4; })
      .map((e) => Math.round(e.getBoundingClientRect().height));
    if (!bs.length || !is.length) continue;
    const b = Math.max(...bs), i = Math.max(...is);
    if (b > i) formPairs.push({ button: b, input: i, sel: sel(form) });
  }

  const buttonsT = withTarget(buttonEls);
  const inputsT = withTarget(inputEls);

  // 🚨 「ボタンが入力より高くならないこと」は**ページ内フォームのボタン**の話（憲章 §3 の表）。
  //    「モーダル / SP の主要アクション」は**全幅・pill で大きくする**のが正解なので、比較から外す。
  //    外さないと、正しく作られたログイン画面の 44px ボタンが違反として出る（実測で踏んだ）。
  const isFullWidth = (el) => {
    const p = el.parentElement;
    if (!p) return false;
    return el.getBoundingClientRect().width >= p.getBoundingClientRect().width * 0.9;
  };
  const inlineButtons = [...document.querySelectorAll("button, [data-slot=button]")]
    .filter((el) => el.getBoundingClientRect().height > 0 && !isFullWidth(el))
    .map((el) => Math.round(el.getBoundingClientRect().height * 10) / 10);

  const scrollers = [...document.querySelectorAll("*")].map((el) => {
    const s = getComputedStyle(el);
    const oy = /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1;
    const ox = /(auto|scroll)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 1;
    if (!oy && !ox) return null;
    const faded = s.maskImage !== "none" || s.webkitMaskImage !== "none" ||
                  String(el.className).includes("scroll-fade");
    return { sel: sel(el), axis: (ox ? "x" : "") + (oy ? "y" : ""), faded };
  }).filter(Boolean);

  // 🚨 読み上げ専用（sr-only）は「潰れている」ではない。**正しい実装**なので除外する。
  //    signature: clip-path: inset(50%) か clip が指定された箱。
  //    🚨 clip / clip-path は**子へ継承されない**ので、子だけ見ると見逃す。
  //    2026-08-13 実測: dialog-title の computed は clipPath:none だったが、
  //    **親の dialog-header が sr-only（clip-path: inset(50%)）**だった。
  //    → 祖先まで遡る。本当に潰れた箱は clip を持たないので、これで区別できる。

  // ── 🚨 「潰れ」の検出 ────────────────────────────────────────────────
  // 由来: 2026-08-13。Surface の外側 div が幅0になり、**ログイン画面の文字が1文字ずつ縦に並んだ**。
  // それでもこの検査は「深さ1・あふれ0・タップ領域OK」で**合格を返した**。
  //
  // 原因は検査の思想。深さ・あふれ・寸法は**すべて「多すぎる」を測る検査**で、
  // **「少なすぎる・狭すぎる」を測る目が1つも無かった**。壊れ方の半分を見ていなかった。
  // （knowledge/decisions/verify-the-verifier.md）
  const SKIP = "script,style,head,meta,link,title,br,option,optgroup,svg *,[hidden],[aria-hidden=true]";
  const vw = document.documentElement.clientWidth;
  const collapsed = [];

  // ① ランドマークが画面幅に対して極端に狭い。これが今回の本体。
  for (const el of document.querySelectorAll("main,[role=main]")) {
    const r = el.getBoundingClientRect();
    if (r.width < vw * 0.6) {
      collapsed.push({ kind: "本文が狭い", sel: sel(el), w: Math.round(r.width), expected: Math.round(vw * 0.6) });
    }
  }

  // ② 自分で文字を持っているのに、箱が極端に狭い＝文字が縦積みになる。
  //    「自分が直接持つ文字」だけを見る（子孫の文字を数えると親まで巻き込むため）。
  for (const el of document.querySelectorAll("body *")) {
    if (el.matches(SKIP)) continue;
    const s = getComputedStyle(el);
    if (!shown(el)) continue;
    const r = el.getBoundingClientRect();
    if (srOnly(el)) continue;                                  // 読み上げ専用（正しい実装）
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join("");
    if (own.length < 4) continue;
    // 🚨 「40px 未満」という絶対値で見ない。**文字の大きさを見ていなかった**（2026-08-13 base2 の指摘）。
    //    下部ナビのラベルは 10px なので、"Home" は 28px でも**1行に収まる**。それを縦積みと誤報していた。
    //    → **症状そのもの（本当に折り返しているか）**を測る:
    //       ・高さが 1行を明らかに超えている（= 複数行になっている）
    //       ・かつ 1行に入る文字数が極端に少ない（幅が文字の大きさの数倍しかない）
    const fs = px(getComputedStyle(el).fontSize) || 16;
    const multiLine = r.height > fs * 2;      // 2行分を超えている
    const tooNarrow = r.width < fs * 2.5;     // 1行に 2〜3 文字も入らない
    if (multiLine && tooNarrow) {
      collapsed.push({
        kind: "文字が縦積み", sel: sel(el),
        w: Math.round(r.width), h: Math.round(r.height), fs, text: own.slice(0, 16),
      });
    }
  }

  // ③ 中身があるのに幅が 0。親が潰れている決定的な証拠。
  for (const el of document.querySelectorAll("body *")) {
    if (el.matches(SKIP)) continue;
    const s = getComputedStyle(el);
    if (!shown(el) || srOnly(el) || s.position === "fixed") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && el.textContent.trim().length > 0) {
      collapsed.push({ kind: "幅が0", sel: sel(el), h: Math.round(r.height), text: el.textContent.trim().slice(0, 16) });
    }
  }

  // 🚨 区切り線の重複を測る。
  // 由来: 2026-08-14 堀池「**区切りが重複している**」（スクリーンショット付き）。
  // Surface が border-y（上下）を持つため、**隣り合うと下の線と上の線が並んで2本**になる。
  // 面の深さ・潰れ・寸法のどれでも見えない（1〜3辺の罫線は面に数えないため）。**新しい目が要る。**
  const rules = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!shown(el) || srOnly(el)) continue;
    // 🚨 部品（ボタン・入力・標識）自身の罫線は「区切り」ではない。除外する。
    if (el.matches(FORM) || el.matches(ACTION) || el.matches(INDICATOR)) continue;
    const cs = getComputedStyle(el);
    // 🚨 固定バーは中身の上に浮くだけで、区切りを二重にしているわけではない（憲章 §1 の 2-6）。
    if (cs.position === "fixed" || cs.position === "sticky") continue;
    // 🚨 **読み上げから外された層は、比べる相手ではない。**
    //    ドロワー（Sheet）を開くと背後の全体が inert / aria-hidden になる。
    //    そこにある線と、ドロワーの中の線が偶然7px 離れて並び、「区切りが重複」と出た
    //    （2026-08-15 実測。**別の層にあるものを比べていた**＝検査の誤り）。
    if (el.closest("[aria-hidden=true], [inert]")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 40) continue;
    // 🚨 **4辺すべてに罫線があって角が丸い箱は「カード」。その上下の辺は区切りではなく輪郭。**
    //    2026-08-14 実測: Surface は SP で border-t（＝区切り）、
    //    PC では @md/surface:rounded-xl + @md/surface:border（＝カード）になる。
    //    カードを縦に並べれば下辺と上辺が 24px 空けて並ぶのは**当たり前**で、重複ではない。
    //    これを数えたせいで、**正しく作られた3ページを違反として報告した**（今夜7件目の誤検出）。
    //    🚨 SP 側（角が丸くない・上辺だけ）は今までどおり検出する。オーナー指摘はそちら。
    const allSides = ["Top", "Right", "Bottom", "Left"]
      .every((d) => px(cs["border" + d + "Width"]) > 0 && !clear(cs["border" + d + "Color"]));
    const rounded = px(cs.borderTopLeftRadius) > 0 || px(cs.borderTopRightRadius) > 0;
    if (allSides && rounded) continue;
    for (const side of ["Top", "Bottom"]) {
      const w = px(cs["border" + side + "Width"]);
      if (w <= 0 || clear(cs["border" + side + "Color"])) continue;
      rules.push({ y: side === "Top" ? r.top : r.bottom, x1: r.left, x2: r.right, sel: sel(el), side });
    }
  }
  // hr も数える（Divider の実体）
  for (const el of document.querySelectorAll("hr")) {
    if (!shown(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width >= 40) rules.push({ y: r.top, x1: r.left, x2: r.right, sel: sel(el), side: "hr" });
  }
  // 🚨 「重複」の定義は「**2本の線の間に何も無い**」。
  //    最初 2px 以内で見たら検出できなかった。実際は間に余白（space-y-6 = 24px）があり、
  //    **離れているが仕事が重複している**のが症状だった（2026-08-14 実測で判明）。
  const textBoxes = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!shown(el) || srOnly(el)) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join("");
    if (!own) continue;
    const r = el.getBoundingClientRect();
    if (r.height > 0) textBoxes.push([r.top, r.bottom]);
  }
  // 🚨 **同じ線を2回数えない。**
  //    <hr class="border-0 border-t"> は「上辺に罫線を持つ要素」としても、
  //    「hr そのもの」としても拾われ、**同じ y に2本ある**ことになる（gap 0）。
  //    → 正しく作られたオンボーディング画面が「区切りが重複」と出た（2026-08-14・10件目の誤検出）。
  //    位置がほぼ同じ線は1本に畳む。
  const uniq = [];
  for (const r2 of rules.sort((a, b) => a.y - b.y)) {
    const last = uniq[uniq.length - 1];
    if (last && Math.abs(last.y - r2.y) < 1.5
        && Math.abs(last.x1 - r2.x1) < 2 && Math.abs(last.x2 - r2.x2) < 2) continue;
    uniq.push(r2);
  }
  rules.length = 0;
  rules.push(...uniq);

  const doubled = [];
  for (let i = 1; i < rules.length; i++) {
    const a2 = rules[i - 1], b2 = rules[i];
    const gap = b2.y - a2.y;
    if (gap > 48) continue;                                              // 離れすぎ = 別の区切り
    if (Math.min(a2.x2, b2.x2) - Math.max(a2.x1, b2.x1) <= 40) continue; // 横が重なっていない
    // 2本のあいだに文字を持つ箱があれば、それは「別々の区切り」なので重複ではない
    const hasContent = textBoxes.some(([t, b3]) => t >= a2.y - 1 && b3 <= b2.y + 1);
    if (!hasContent) {
      doubled.push({ gap: Math.round(gap), y: Math.round(a2.y), a: a2.sel + ":" + a2.side, b: b2.sel + ":" + b2.side });
    }
  }

  // 🚨 「揃って見えるか」は高さだけでは測れない。
  // 由来: 2026-08-14 堀池「サイドメニューの『設定』アコーディオンの高さが違う」。
  // 実測すると **箱は全部 44px で揃っていた**。違ったのは align-items（1つだけ flex-start）で、
  // **文字が箱の上に張り付いていた**。私の検査は高さしか見ていないので**何も報告しなかった**。
  // 測り方は base2 の提案（Range で「文字が実際に占めている矩形」を取る）。
  const textOffset = (el) => {
    const r = el.getBoundingClientRect();
    if (r.height === 0) return null;
    const range = document.createRange();
    range.selectNodeContents(el);
    const tr = range.getBoundingClientRect();
    range.detach?.();
    if (tr.height === 0) return null;
    return (tr.top + tr.bottom) / 2 - (r.top + r.bottom) / 2;   // 箱の中心と文字の中心のずれ
  };
  const misaligned = [];
  const seenParents = new Set();
  for (const el of document.querySelectorAll("a, button, [data-slot=accordion-trigger]")) {
    const parent = el.parentElement;
    if (!parent || seenParents.has(parent)) continue;
    seenParents.add(parent);
    const rows = [...parent.children]
      .filter((c) => c.matches("a, button, [data-slot=accordion-trigger]") && shown(c))
      .map((c) => ({ sel: sel(c), off: textOffset(c), h: Math.round(c.getBoundingClientRect().height) }))
      .filter((x) => x.off !== null);
    if (rows.length < 2) continue;
    const offs = rows.map((x) => x.off);
    const spread = Math.max(...offs) - Math.min(...offs);
    // 高さが揃っているのに文字の位置だけずれている、が今回の症状
    const heights = new Set(rows.map((x) => x.h));
    if (spread > 2 && heights.size === 1) {
      const worst = rows.slice().sort((a, b) => Math.abs(b.off) - Math.abs(a.off))[0];
      misaligned.push({
        spread: Math.round(spread * 10) / 10, h: worst.h,
        odd: worst.sel, off: Math.round(worst.off * 10) / 10,
      });
    }
  }

  // 🚨 文字そのものを測る。
  // 由来: 2026-08-13 堀池さん「**noto sans じゃない**」。
  // 深さ・幅・寸法をいくら測っても**書体は永久に見つからない**（base の指摘）。
  // 明朝になっていても、フォントが英字向けで日本語の字面が崩れていても、他の検査は全部通る。
  const bodyStyle = getComputedStyle(document.body);
  const fontFamily = bodyStyle.fontFamily;
  const de = document.documentElement;

  // 🚨 読み上げ名の候補: **見えている文字を持たない操作部品**（アイコンだけのボタン等）。
  //    文字があるものは名前を持てているので、危ないのはここだけ。
  //    sel() は一意ではないので、**印を付けてから** CDP 側で引く。
  // 🚨 **変えられない値が、入力欄に見えていないか**（堀池・2026-08-15）:
  // > 「変更できない ID などはそもそも背景を Input タグと同じにしない。（背景なし）
  // >   …背景が .bg-muted/60 なので、**編集できると思ってしまう**。
  // >   **これは UIUX で絶対にやってはいけないこと。**」
  // readOnly なのに塗りや罫線を持っていたら違反。**disabled は対象外**（別の意味なので）。
  const editableLooking = [];
  for (const el of document.querySelectorAll("input[readonly], textarea[readonly]")) {
    if (!shown(el) || srOnly(el) || el.disabled) continue;
    const cs = getComputedStyle(el);
    const hasBg = !clear(cs.backgroundColor);
    const hasBorder = ["Top", "Right", "Bottom", "Left"]
      .some((d) => px(cs["border" + d + "Width"]) > 0 && !clear(cs["border" + d + "Color"]));
    if (hasBg || hasBorder) {
      editableLooking.push({
        sel: sel(el),
        bg: hasBg ? cs.backgroundColor : null,
        border: hasBorder ? cs.borderTopColor : null,
      });
    }
  }

  const nameless = [];
  {
    let n = 0;
    for (const el of document.querySelectorAll("button, a[href], summary, [role=button]")) {
      if (!shown(el) || srOnly(el)) continue;
      if ((el.textContent || "").trim().length > 0) continue;
      const mark = "ax" + (n++);
      el.setAttribute("data-ax-probe", mark);
      // 🚨 印だけ返すと「ax0 に名前が無い」としか報告できず、**人が直せない**。
      //    どこの何かが分かる説明を必ず添える（2026-08-14 実測で踏んだ）。
      nameless.push({
        q: "[data-ax-probe='" + mark + "']",
        sel: sel(el),
        html: el.outerHTML.replace(/\s+/g, " ").slice(0, 110),
      });
      if (n >= 40) break;
    }
  }

  return {
    misaligned: misaligned.slice(0, 5),
    misalignedCount: misaligned.length,
    doubledRules: doubled.slice(0, 8),
    doubledRulesCount: doubled.length,
    collapsed: collapsed.slice(0, 12),
    collapsedCount: collapsed.length,
    fontFamily,
    bodyWidth: Math.round(document.body.getBoundingClientRect().width),
    mainWidth: (() => { const m = document.querySelector("main,[role=main]"); return m ? Math.round(m.getBoundingClientRect().width) : null; })(),
    viewportWidth: de.clientWidth,
    lineHeight: bodyStyle.lineHeight,
    maxDepth, nested: nested.sort((a, b) => b.depth - a.depth).slice(0, 30),
    buttonHeights: [...new Set(buttons.map((b) => b.h))].sort((a, b) => a - b),
    inlineButtonHeights: [...new Set(inlineButtons)].sort((a, b) => a - b),
    formPairs: formPairs.slice(0, 4),
    nameless,
    editableLooking,
    // 🚨 **横に長すぎる入力を見る。** 堀池（2026-08-15）:
    //    「全てのセクション・要素は PC の場合横長になりすぎる。理由として
    //      **そのフィールドの目的や全体のバランスが見れてない**のが原因。
    //      例えば**電話番号のフィールドは多くても10文字分あれば十分**です。」
    //    🚨 これまで幅を一度も測っていなかった（高さだけ見ていた）ので、
    //    「横長になりすぎる」は**監査では永遠に緑**だった。
    //    本文（richtext / json）と全幅の主要アクションは対象外。
    tooWideInputs: inputEls
      .filter((el) => !el.closest("[data-slot=rich-text]") && el.type !== "checkbox" && el.type !== "radio")
      .map((el) => ({ sel: sel(el), w: Math.round(el.getBoundingClientRect().width),
                      type: el.type || "text", html: el.outerHTML.replace(/\s+/g, " ").slice(0, 90) }))
      .filter((x) => x.w > 720),
    inputHeights: [...new Set(inputs.map((b) => b.h))].sort((a, b) => a - b),
    // 🚨 iOS が勝手に拡大するのは **文字を打ち込む欄** の font-size が 16px 未満のとき（憲章 §7）。
    // チェックボックス・ラジオ・ファイル選択は拡大しないので除く（除かないと誤検出になる）。
    // ボタンの文字が小さいのは別の問題（下の tapTargets）なので混ぜない。
    zoomingInputs: [...document.querySelectorAll(
      "textarea, select, input:not([type=checkbox]):not([type=radio]):not([type=file])" +
      ":not([type=range]):not([type=color]):not([type=submit]):not([type=button]):not([type=hidden])",
    )].map((el) => {
      const s = getComputedStyle(el), r = el.getBoundingClientRect();
      if (r.height === 0 || px(s.fontSize) >= 16) return null;
      return { fs: Math.round(px(s.fontSize) * 10) / 10, h: Math.round(r.height), sel: sel(el) };
    }).filter(Boolean),
    // タップ領域。**2段階で見る**。
    //   24px … WCAG 2.2 SC 2.5.8 Target Size (Minimum) Level AA。「at least 24 by 24 CSS pixels」
    //          → これを割るのは**違反**（間隔の例外はあるが、既定では満たすべき）
    //   44px … WCAG 2.1 SC 2.5.5 Target Size (Enhanced) Level AAA。「at least 44 by 44 CSS pixels」
    //          → SP の主要アクションはここを狙う。全部に課すと PC のインライン高さ規律と両立しないので、
    //            **違反にはせず参考値として数える**
    tapTargetsUnder24: [...buttonsT, ...inputsT].filter((x) => x.h < 24).map((x) => ({ h: x.h, fs: x.fs, sel: x.sel, html: x.html })),
    tapTargetsUnder44: [...buttonsT, ...inputsT].filter((x) => x.h < 44).map((x) => ({ h: x.h, fs: x.fs, sel: x.sel, html: x.html })),
    scrollers,
    scrollersWithoutFade: scrollers.filter((s) => !s.faded).length,
    overflowX: de.scrollWidth - de.clientWidth,
    // 🚨 navLinks は情報として残すが、描画生存確認には使わない。
    //    サイドバーのマークアップ（nav の内外など）が変わるたびに嘘をつく代理値だから。
    navLinks: [...document.querySelectorAll("nav a, aside a")].filter((a) => a.getBoundingClientRect().width > 0).length,
    hasBottomNav: [...document.querySelectorAll("*")].some((el) => {
      const s = getComputedStyle(el);
      return (s.position === "fixed" || s.position === "sticky") && px(s.bottom) === 0 &&
             el.getBoundingClientRect().height > 20 && el.querySelectorAll("a,button").length >= 2;
    }),
    renderTextChars: (() => {
      const text = document.body ? document.body.innerText.replace(/\s+/g, " ").trim() : "";
      return text.length;
    })(),
    loadMs: (() => { const n = performance.getEntriesByType("navigation")[0]; return n ? Math.round(n.duration) : null; })(),
  };
})()`;

// ── CDP ────────────────────────────────────────────────────────────────
/**
 * 🚨 空いているポートを OS に選ばせる。固定ポートにしてはいけない。
 * 前回の Chrome が生き残って同じポートを掴んでいると、**新しく spawn した Chrome ではなく
 * 古いタブを操作してしまい、指定していないページを測る**（実測で踏んだ）。
 * `--cdp-port` を明示したときだけその値を使う。
 */
function freePort() {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.on("error", rej);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });
}

// ── headless Chrome の後始末 ───────────────────────────────────────────
// 🚨 proc.kill() を成功経路にだけ置くと、測定中の例外・Ctrl-C・親プロセスの停止で
//    Chrome が親なし(PPID=1)のまま残る。残った headless Chrome は macOS の
//    LaunchServices に type="Foreground" で登録されるため、
//    **Chrome.app を起動しても既存の headless が前面に出るだけでウィンドウが開かなくなる**。
//    2026-08-15 に実際に 4 セット(41 プロセス・約 2.8GB)が残り、Chrome が使えなくなった。
//    使い捨てプロファイルも消えずにゴミ箱へ約 240 個溜まっていた。
const launched = [];
let cleanedUp = false;
function cleanupChrome() {
  if (cleanedUp) return;
  cleanedUp = true;
  for (const { proc, profile } of launched) {
    try { proc.kill("SIGKILL"); } catch { /* すでに終了している */ }
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* 消せなくても続行 */ }
  }
}
process.on("exit", cleanupChrome);
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => { cleanupChrome(); process.exit(130); });
}
process.on("uncaughtException", (e) => { cleanupChrome(); console.error(e); process.exit(1); });
process.on("unhandledRejection", (e) => { cleanupChrome(); console.error(e); process.exit(1); });

async function launchChrome() {
  const port = PORT || (await freePort());
  // プロファイルも毎回使い捨てにする（同じプロファイルは多重起動でロックされる）。
  const profile = mkdtempSync(join(tmpdir(), "ohmycms-audit-"));
  for (const bin of CHROME_CANDIDATES) {
    const proc = spawn(bin, [
      "--headless=new", `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars",
      "about:blank",
    ], { stdio: "ignore" });
    // 起動した瞬間に後始末の対象へ入れる（起動確認を待たない。
    // 待つと、待っている最中に落ちたときに取りこぼす）。
    launched.push({ proc, profile });
    let failed = false;
    proc.on("error", () => { failed = true; });
    for (let i = 0; i < 60 && !failed; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        const page = list.find((t) => t.type === "page");
        if (page) return { proc, page };
      } catch { /* まだ立ち上がっていない */ }
      await sleep(250);
    }
    proc.kill();
  }
  throw new Error(
    "Chrome が見つからないか起動しませんでした。CHROME_PATH で明示してください。\n" +
    "  探した場所: " + CHROME_CANDIDATES.join(", "),
  );
}

function connect(url) {
  const ws = new WebSocket(url);
  const pending = new Map();
  let id = 0;
  const ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  // 🚨 画面側のエラーを拾う受け皿。--dump のときだけ出す。
  //    レンダラが落ちると Runtime.evaluate は何も言わないので、
  //    **落ちる直前のコンソール**が唯一の手がかりになる（2026-08-14 実測）。
  const events = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (!msg.id) {
      if (msg.method === "Runtime.exceptionThrown") {
        const d = msg.params?.exceptionDetails;
        events.push(`例外: ${d?.exception?.description ?? d?.text ?? "?"}`.split("\n").slice(0, 3).join(" / "));
      } else if (msg.method === "Runtime.consoleAPICalled" && /error|warning/.test(msg.params?.type)) {
        events.push(`${msg.params.type}: ${(msg.params.args ?? []).map((a) => a.description ?? a.value ?? "").join(" ").slice(0, 300)}`);
      } else if (msg.method === "Inspector.targetCrashed") {
        events.push("🚨 レンダラが落ちました（Inspector.targetCrashed）");
      }
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.rej(new Error(JSON.stringify(msg.error)));
    else p.res(msg.result);
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  return {
    ready,
    send,
    close: () => ws.close(),
    peekEvents: () => events.slice(),
    drainEvents: () => events.splice(0),
    clearEvents: () => { events.length = 0; },
  };
}

/**
 * 🚨 **接続できていないのか、別のページへ飛ばされたのかを分ける**（2026-08-15）。
 *
 * Chrome は**接続不可でも自前のエラーページへ遷移して load が発火する**ので、
 * 着地先だけを見ると「別の場所に着いた」に見える。実測: `--base http://localhost:3199`
 * （何も待ち受けていないポート）で「**別の場所に着きました: /**」と出ていた。
 * 🚨 **サーバが落ちていても、ブラウザは「読み込めた」と言う。**
 * これが base2 の「パンくずが見つからない → 実装が壊れた」と読みかけた形の正体。
 */
function landingReason(landed) {
  if (typeof landed === "string" && landed.startsWith("chrome-error://")) {
    return "🚨 サーバへ接続できていません（Chrome のエラーページに着いています）。--base のポートで待ち受けているか確かめてください";
  }
  if (landed === "/login") return "ログインしていません（--session のトークンが切れている可能性）";
  return `別の場所に着きました: ${landed}`;
}

async function navigateAndSettle(cdp, path) {
  await cdp.send("Page.navigate", { url: BASE + path });
  // 🚨 固定待ちにしない。dev サーバは初回アクセスでルートをコンパイルするので、
  //    固定 1500ms だと**前のページを測ってしまい、実行のたびに深さが変わる**（実測で判明）。
  //    「読み込み完了」かつ「URL が目的地」になるまで待つ。
  const target = new URL(BASE + path).pathname;
  let settled = false;
  let landed = target;
  for (let i = 0; i < 40; i++) {
    const { result } = await cdp.send("Runtime.evaluate", {
      // 🚨 `location.pathname` だけを見ない。**Chrome のエラーページでは `/` になる**ので、
      //    接続不可が「別の場所に着いた」と同じ顔になる（2026-08-15 実測）。
      //    `protocol` を一緒に採ると `chrome-error:` で見分けられる。
      expression: `({ ready: document.readyState, path: location.protocol === "chrome-error:" ? "chrome-error://" + location.pathname : location.pathname })`,
      returnByValue: true,
    });
    landed = result.value.path;
    if (result.value.ready === "complete") {
      if (landed === target) { settled = true; break; }
      // 🚨 目的地と違う所に着いた＝リダイレクト。待っても変わらないので即座に諦める。
      // ここで待ち続けると 1 ページ 30 秒を無駄にし、**堀池さんが見ている dev サーバに負荷をかける**。
      break;
    }
    await sleep(500);
  }
  return { settled, landed, target };
}

function normalizeLocalHref(href) {
  try {
    const base = new URL(BASE);
    const url = new URL(href, base);
    if (url.origin !== base.origin) return null;
    return url.pathname;
  } catch {
    return null;
  }
}

function measureExpression(selector) {
  return `(() => {
    const selector = ${JSON.stringify(selector)};
    const px = (v) => parseFloat(v) || 0;
    const rounded = (n) => Math.round(n * 10) / 10;
    const shown = (el) => (typeof el.checkVisibility === "function"
      ? el.checkVisibility()
      : (() => { const s = getComputedStyle(el); return s.display !== "none" && s.visibility !== "hidden"; })());
    const sel = (el) => {
      let s = el.tagName.toLowerCase();
      if (el.id) s += "#" + el.id;
      const slot = el.getAttribute("data-slot");
      if (slot) s += "[data-slot=" + slot + "]";
      const cls = (el.getAttribute("class") || "").split(/\\s+/).filter(Boolean).slice(0, 5).join(".");
      if (cls) s += "." + cls;
      return s.slice(0, 160);
    };
    const firstTextNode = (el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          return node.nodeValue.trim()
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        },
      });
      return walker.nextNode();
    };
    let all;
    try {
      all = [...document.querySelectorAll(selector)];
    } catch (error) {
      return { selector, invalid: true, error: String(error?.message ?? error), count: 0, items: [] };
    }
    const items = all
      .filter((el) => shown(el) && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0)
      .map((el) => {
        const boxRect = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const textNode = firstTextNode(el);
        let textRect = null;
        let textStyle = cs;
        if (textNode) {
          const range = document.createRange();
          range.selectNodeContents(textNode);
          const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
          const tr = rects[0] ?? range.getBoundingClientRect();
          range.detach?.();
          if (tr && tr.height > 0) {
            textRect = {
              top: rounded(tr.top),
              left: rounded(tr.left),
              height: rounded(tr.height),
              width: rounded(tr.width),
            };
          }
          if (textNode.parentElement) textStyle = getComputedStyle(textNode.parentElement);
        }
        const text = (el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim();
        return {
          sel: sel(el),
          box: {
            top: rounded(boxRect.top),
            height: rounded(boxRect.height),
            width: rounded(boxRect.width),
          },
          text: text.length > 60 ? text.slice(0, 57) + "..." : text,
          textBox: textRect,
          space: textRect ? {
            top: rounded(textRect.top - boxRect.top),
            bottom: rounded(boxRect.bottom - (textRect.top + textRect.height)),
            // 🚨 左の余白も出す（2026-08-15）。字下げ・枝の長さ・罫線とテキストの間隔は
            //    **横方向**の値なので、上下だけでは確かめられなかった。
            //    ツリーの受入が「罫線↔テキスト 4px が em でないこと」を求めている。
            left: rounded(textRect.left - boxRect.left),
          } : null,
          fontSize: rounded(px(textStyle.fontSize)),
          lineHeight: textStyle.lineHeight,
        };
      });
    return { selector, invalid: false, count: items.length, totalMatches: all.length, items };
  })()`;
}

function clipboardWriteExpression(value) {
  return `((async () => {
    window.focus();
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
      return { ok: false, reason: "navigator.clipboard.writeText がありません" };
    }
    try {
      await navigator.clipboard.writeText(${JSON.stringify(value)});
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: String((error && error.name ? error.name + ": " : "") + (error?.message ?? error)),
      };
    }
  })())`;
}

const CLIPBOARD_READ_EXPRESSION = `((async () => {
  window.focus();
  if (!navigator.clipboard || typeof navigator.clipboard.readText !== "function") {
    return { ok: false, reason: "navigator.clipboard.readText がありません" };
  }
  try {
    const value = await navigator.clipboard.readText();
    return { ok: true, value: String(value) };
  } catch (error) {
    return {
      ok: false,
      reason: String((error && error.name ? error.name + ": " : "") + (error?.message ?? error)),
    };
  }
})())`;

function evalFailure(result, fallback) {
  return result.exceptionDetails?.exception?.description
    ?? result.exceptionDetails?.text
    ?? fallback;
}

async function initializeClipboard(cdp) {
  try { await cdp.send("Page.bringToFront"); } catch { /* headless で失敗しても Runtime 側で理由を返す */ }
  const result = await cdp.send("Runtime.evaluate", {
    expression: clipboardWriteExpression(CLIPBOARD_SENTINEL),
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    return { ok: false, reason: evalFailure(result, "clipboard 初期化で例外が発生しました") };
  }
  return result.result.value ?? { ok: false, reason: "clipboard 初期化が結果を返しませんでした" };
}

async function readClipboard(cdp) {
  try { await cdp.send("Page.bringToFront"); } catch { /* headless で失敗しても Runtime 側で理由を返す */ }
  const result = await cdp.send("Runtime.evaluate", {
    expression: CLIPBOARD_READ_EXPRESSION,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    return { ok: false, reason: evalFailure(result, "clipboard 読み取りで例外が発生しました") };
  }
  return result.result.value ?? { ok: false, reason: "clipboard 読み取りが結果を返しませんでした" };
}

function formatClipboardValue(value) {
  const text = String(value);
  if (text.length === 0) return "（空文字）";
  if (text.length <= CLIPBOARD_PREVIEW_CHARS) return text;
  return `${text.slice(0, CLIPBOARD_PREVIEW_CHARS)}\n...（${text.length} 文字中 ${CLIPBOARD_PREVIEW_CHARS} 文字まで表示）`;
}

async function discoverDynamicPaths(cdp) {
  log("\n動的ルート発見:");
  log(`  検索元: ${DISCOVERY_LIST_PATHS.join(", ")}`);
  log(`  方法: 各一覧ページを実ブラウザで開き、DOM 上の a[href] を ${DYNAMIC_ROUTE_PATTERNS.length} 種類のルート形に照合`);

  const byList = [];
  const allHrefs = [];
  for (const listPath of DISCOVERY_LIST_PATHS) {
    const nav = await navigateAndSettle(cdp, listPath);
    if (!nav.settled) {
      const why = nav.landed === "/login"
        ? "ログインしていません（--session のトークンが切れている可能性）"
        : landingReason(nav.landed);
      byList.push({ path: listPath, ok: false, hrefs: [], why });
      log(`  検索元: ${listPath} → 🚨 開けず（${why}）。この一覧の href は検索していません`);
      continue;
    }
    await sleep(400);
    const got = await cdp.send("Runtime.evaluate", {
      expression: `([...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter(Boolean))`,
      returnByValue: true,
    });
    const hrefs = [...new Set((got.result.value ?? []).map(normalizeLocalHref).filter(Boolean))];
    byList.push({ path: listPath, ok: true, hrefs });
    allHrefs.push(...hrefs);
    log(`  検索元: ${listPath} → href ${hrefs.length} 件`);
  }

  const uniqueHrefs = [...new Set(allHrefs)];
  const found = [];
  const missing = [];
  for (const pattern of DYNAMIC_ROUTE_PATTERNS) {
    const path = uniqueHrefs.find((href) => pattern.re.test(href));
    if (path) {
      found.push({ label: pattern.label, path, source: pattern.source });
      log(`  発見: ${pattern.label.padEnd(38)} → ${path}（検索: ${pattern.source}）`);
    } else {
      missing.push({ label: pattern.label, source: pattern.source });
      log(`  発見: ${pattern.label.padEnd(38)} → 🚨 見つからず（検索: ${pattern.source}; 検索元 ${byList.length} ページ; href ${uniqueHrefs.length} 件）`);
    }
  }

  // 🚨 **`missing` は 2 つの意味を混ぜていた**（2026-08-15 司令塔の指摘で分けた）。
  //    ① 一覧を巡回したのに href が 1 件も取れなかった
  //       → **発見の段そのものが壊れている**。巡回が成立していないので **失敗**（exit 1）
  //    ② href は取れたが、そのパターンに一致するものが無かった
  //       → **失敗ではない**。データがまだ無い（`/admin/content/<c>/<id>`）か、
  //         そもそも一覧から辿れない（`/admin/collections/<c>/fields/new`）だけ。
  //         ここで落とすと**恒常的に落ち続け、全ペインが止まる**
  //         （polish がページ送りで同じ判断をしている）。
  //    🚨 ただし②も**黙らない**。末尾の集計へ「測っていない」として出す。
  //       印字だけして終了コードに届かなかったのが、この欠陥の元の姿だった。
  const crawlFailed = uniqueHrefs.length === 0;
  return { byList, hrefs: uniqueHrefs, found, missing, crawlFailed };
}

/**
 * 🚨 **行のあるコレクションを必ず測る。**
 *
 * 由来（2026-08-15・本番停止級の実例）: `/admin/content/<コレクション>` は
 * **行があると 500、行が 0 件だと 200** という壊れ方をしていた
 * （一覧が `<Button>` を出すのは行ごとの削除ボタンだけなので、空だと 1 つも描かれない）。
 * この監査は当時も緑だった。理由は規則ではなく**測った相手**にある:
 *
 *   - `discoverDynamicPaths()` は `uniqueHrefs.find(...)` で **最初に一致した href** を採る
 *   - たまたま **0 行の `acc_748015_pl`** が先に並んでいた
 *   - → **毎回「空のコレクション」を測っていた**
 *
 * **「全ページ 200」は「データが空のときは 200」しか意味していなかった。**
 * 開発者の既定（空の DB）と利用者の既定（データがある）が違う、の最も高くついた例。
 *
 * だからここで **API に行数を聞き**、`0 行` と `1 行以上` を**別々の画面として**測る。
 * 🚨 **行のあるコレクションが 1 つも無ければ「測れなかった」として落とす**（緑にしない）。
 */
const CONTENT_LIST_PAGE_SIZE = 20; // lib/admin/list-view.ts の DEFAULT_LIST_LIMIT と揃える

async function api(pathname) {
  const res = await fetch(new URL(pathname, BASE), {
    headers: SESSION ? { cookie: `session=${SESSION}` } : {},
  });
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, status: res.status, body: await res.json() };
}

async function inspectDataFixtures() {
  log("\nデータのフィクスチャ:");
  if (!SESSION) {
    log("  🚨 --session が無いので行数を聞けません。**測れなかった**として扱います。");
    return { measured: false, why: "--session が渡されていない", counts: [], targets: [], blocking: true };
  }

  const list = await api("/api/collections?names=true");
  if (!list.ok) {
    log(`  🚨 /api/collections が ${list.status}。**測れなかった**として扱います。`);
    return { measured: false, why: `/api/collections が ${list.status}`, counts: [], targets: [], blocking: true };
  }
  const names = (Array.isArray(list.body) ? list.body : list.body?.data ?? [])
    .map((row) => (typeof row === "string" ? row : row?.collection))
    .filter(Boolean);
  log(`  コレクション ${names.length} 件に行数を聞きます（/api/items/<c>?limit=1&meta=filter_count）`);

  const counts = [];
  for (const name of names) {
    const got = await api(`/api/items/${encodeURIComponent(name)}?limit=1&meta=filter_count`);
    const rows = got.ok ? got.body?.meta?.filter_count ?? null : null;
    // 🚨 行数が取れなかったものを 0 に丸めない。「0 行」と「聞けなかった」は別。
    counts.push({ collection: name, rows, firstId: got.ok ? got.body?.data?.[0]?.id ?? null : null });
    log(`    ${name.padEnd(28)} ${rows === null ? "🚨 行数を聞けませんでした" : `${rows} 行`}`);
  }

  const withRows = counts.filter((c) => typeof c.rows === "number" && c.rows > 0);
  const empty = counts.filter((c) => c.rows === 0);
  const paged = withRows.filter((c) => c.rows > CONTENT_LIST_PAGE_SIZE);
  // 行が多いものを優先する（ページ送りの操作まで画面に出るため）
  const primary = paged[0] ?? withRows.sort((a, b) => b.rows - a.rows)[0] ?? null;

  const targets = [];
  if (primary) {
    targets.push({ path: `/admin/content/${encodeURIComponent(primary.collection)}`, why: `${primary.rows} 行（行のある一覧）` });
    if (primary.firstId) {
      targets.push({ path: `/admin/content/${encodeURIComponent(primary.collection)}/${encodeURIComponent(primary.firstId)}`, why: "行のあるコレクションの 1 件目" });
    }
  }
  if (empty[0]) {
    // 空の一覧は**別の画面**（「まだありません」の見え方・面の深さが変わる）。両方測る。
    targets.push({ path: `/admin/content/${encodeURIComponent(empty[0].collection)}`, why: "0 行（空の一覧）" });
  }

  if (!primary) {
    log("  🚨 **行のあるコレクションがありません。** この監査は「空のデータについての結果」しか出せません。");
    log("     直し方: 管理画面か API でコレクションを 1 つ作り、行を 1 件入れてから測り直してください。");
    // ここで作る zz_* は、あとから「検証用のゴミ」に見える。
    // 常設にするなら knowledge/decisions/permanent-fixtures-are-not-junk.md の表に足すこと
    // （表に無いものは次の掃除で消える。消す前の手順も同じ文書にある）。
    log("       curl -X POST <base>/api/collections -H 'content-type: application/json' -d '{\"collection\":\"zz_probe\"}'");
    log("       curl -X POST <base>/api/items/zz_probe -H 'content-type: application/json' -d '{}'");
    return { measured: false, why: "行のあるコレクションが 1 つも無い", counts, targets, blocking: true };
  }

  // 🚨 ページ送りは**落とさない**。落とすと行数の少ない DB で全員が止まる。
  //    ただし「測っていない」ことは必ず言う（黙って緑にしない）。
  //
  // 🚨 **言う場所は末尾の集計ブロック**（design 指示 2026-08-15）。途中のログ行に出すだけでは
  //    `missing` の 🚨見つからず と**同じ形の失敗**になる——印字されているのに誰の目にも留まらず
  //    exit 0 で流れる。**印字は「効いている」ではない。受入で読まれるのは末尾の数行だけ。**
  //    ここでは理由に使う数（実際に見つかった最大の行数）を持ち帰るだけにする。
  const maxRows = Math.max(0, ...counts.map((c) => (typeof c.rows === "number" ? c.rows : 0)));
  log(`  測る対象: ${targets.map((t) => `${t.path}（${t.why}）`).join(" / ")}`);
  return {
    measured: true, why: null, counts, targets, blocking: false,
    pagedMissing: !paged[0],
    // 「なぜ測れなかったか」を末尾に書くための材料。理由が無いと次の人が推測で埋める。
    pagedMissingWhy: !paged[0]
      ? `行数 ${maxRows} < ${CONTENT_LIST_PAGE_SIZE + 1} のため`
      : null,
  };
}

// ── 常設の標本を確かめる ──────────────────────────────────────────────
// 🚨 ページを1枚も開く前に、常設の標本（zz_probe_actions 等）が生きているかを確かめる。
//    由来: knowledge/decisions/permanent-fixtures-are-not-junk.md。標本が消えた日、
//    行が要る検査が「測れなかった」のに「異常なし」と読まれた。それを二度と起こさない。
//
//    verify:fixtures は子プロセスで呼ぶ（import しない）。verify-fixtures.ts は別担当が
//    同時に書き換えているため、CLI の終了コードだけに依存する形にすれば中身が変わっても壊れない。
//
//    終了コードは2種類あり、監査側は原因を言い換えない（言い換えると「無い」と
//    「取りに行けていない」が同じ顔になる）:
//      exit 1 … DB に繋げて、標本が欠けている
//      exit 2 … 決定文書の表が読めない / DB に繋げない（＝測れていない。標本の有無は不明）
//    どちらでも監査は続けない。「--skip-fixtures」のような回避旗は作らない
//    （作ると DB が無い日に必ず使われ、元の事故がそのまま戻る）。
try {
  execFileSync("bun", ["run", "--filter", "@ohmycms/studio", "verify:fixtures"], { stdio: "inherit" });
} catch (error) {
  const code = typeof error?.status === "number" && error.status !== 0 ? error.status : 1;
  console.error(`\n常設の標本の検査が非0で終了しました（exit ${code}）。監査を中止します。`);
  process.exit(code);
}

// ── 実行 ────────────────────────────────────────────────────────────────
const { page } = await launchChrome();
const cdp = connect(page.webSocketDebuggerUrl);
await cdp.ready;
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");
await cdp.send("Accessibility.enable");
await cdp.send("Network.enable");

let clipboardPermission = null;
if (CLIPBOARD) {
  const origin = new URL(BASE).origin;
  // 🚨 陰性対照用。通常の --clipboard は必ず CDP で権限を与える。
  //    `OHMYCMS_AUDIT_SKIP_CLIPBOARD_PERMISSION=1` のときだけ、権限なしで読めないことを確認する。
  if (process.env.OHMYCMS_AUDIT_SKIP_CLIPBOARD_PERMISSION === "1") {
    clipboardPermission = {
      ok: false,
      origin,
      reason: "OHMYCMS_AUDIT_SKIP_CLIPBOARD_PERMISSION=1 のため CDP 権限付与を飛ばしました",
    };
  } else {
    try {
      await cdp.send("Browser.grantPermissions", {
        origin,
        permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
      });
      clipboardPermission = { ok: true, origin };
    } catch (error) {
      clipboardPermission = {
        ok: false,
        origin,
        reason: String(error?.message ?? error),
      };
      log(`クリップボード権限: 読み書き許可を与えられませんでした（${clipboardPermission.reason}）`);
    }
  }
}

// 🚨 **言語を固定する。** headless Chrome の Accept-Language は既定で `en` なので、
//    何もしないと**英語の画面を測る**ことになる（2026-08-15 実測。shell ペインの指摘で発覚）。
//    堀池さんが見ているのは日本語。英語を測った寸法・あふれ・書体は**別の画面の話**になる
//    （日本語は同じ意味でも文字幅が違う。「設定」2文字 と "Settings" 8文字）。
//    --locale en で英語側も測れる。
{
  const { hostname } = new URL(BASE);
  // 🚨 `file://` には hostname が無い。**対照（ローカルの HTML）で検査ごと落ちる**
  //    ので、cookie を置くのは実際のホストがあるときだけ（2026-08-15 実測で踏んだ）。
  if (hostname) {
    await cdp.send("Network.setCookie", {
      name: "ohmycms_locale", value: LOCALE, domain: hostname, path: "/",
    });
    if (SESSION) {
      await cdp.send("Network.setCookie", { name: "session", value: SESSION, domain: hostname, path: "/", httpOnly: true });
    }
  }
}
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let discovery = null;
let fixtures = null;
if (!HAS_EXPLICIT_PATHS) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
  });
  discovery = await discoverDynamicPaths(cdp);
  fixtures = await inspectDataFixtures();
  const seen = new Set(PATHS);
  // 🚨 **`seen` は既に PATHS を全部持っている。** 足すぶんにだけ filter を当てること。
  //    最初 `[...PATHS, ...足すぶん].filter(...)` と書いて、**静的な 14 ページが全部消えた**
  //    （18 ページ → 6 ページ）。件数の行を見て気づいた。**件数を出しておいて助かった例。**
  const added = [
    // 🚨 **行のある一覧を先に入れる。** discovery が拾う `/admin/content/<c>` は
    //    「href に最初に出てきたもの」で、**空のコレクションが当たることがある**。
    //    先に入れても、空のほうは path が違うので別途 measure される（両方測るのが狙い）。
    ...fixtures.targets.map((t) => t.path),
    ...discovery.found.map((entry) => entry.path),
  ].filter((path) => {
    if (seen.has(path)) return false;
    seen.add(path);
    return true;
  });
  PATHS = [...PATHS, ...added];
}

const report = {};
const violations = [];

for (const vp of VIEWPORTS) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: vp.width, height: vp.height, deviceScaleFactor: vp.dsf, mobile: vp.mobile,
  });
  for (const path of PATHS) {
    cdp.clearEvents();
    const { settled, landed } = await navigateAndSettle(cdp, path);
    if (!settled) {
      const why = landingReason(landed);
      console.error(`  🚨 ${vp.name} ${path}: ${why} → この行は測定していません`);
      report[`${vp.name} ${path}`] = { skipped: true, landed };
      violations.push({ key: `${vp.name} ${path}`, rule: "測定不能", detail: why });
      continue;
    }
    await sleep(400); // 描画の落ち着き待ち

    const key = `${vp.name} ${path}`;
    let clipboardAudit = null;
    if (CLIPBOARD) {
      const initialized = await initializeClipboard(cdp);
      clipboardAudit = {
        permission: clipboardPermission,
        sentinel: CLIPBOARD_SENTINEL,
        initialized,
        read: null,
      };
      if (!initialized.ok) {
        log(`     クリップボード: 読めなかった（初期化できません: ${initialized.reason}）`);
        violations.push({
          key,
          rule: "測定不能",
          detail: `clipboard を既知の値で初期化できません: ${initialized.reason}`,
        });
      }
    }

    // 🚨 --click があれば押してから測る。押せたかどうかを**必ず出力**する
    //    （押せていないのに緑が出るのが、いちばん危ない）。
    // 🚨 `>>` で区切ると順に押す（SP は「ドロワーを開く → ユーザー行を押す」の2段が要る）。
    // 🚨 **見えている要素だけを押す。** 同じセレクタが PC 用と SP 用で2つ DOM にあり、
    //    画面幅で片方が display:none になっている構成があるため、
    //    querySelector の1つ目を押すと**隠れている方**を押してしまう。
    //    実際に踏んだ: SP で PC サイドバー側の引き金を押し、幅0のメニューを測って「潰れ」と報告した
    //    （2026-08-14。製品ではなく検査の誤り）。
    // 🚨 末尾に `?` を付けた段は「あれば押す」。画面幅で片方にしか無いものを1本の指定で書ける
    //    （SP のドロワーは PC に無い。無いことを違反にすると PC が必ず落ちる）。
    let clickFailed = false;
    for (const raw of CLICK ? CLICK.split(">>").map((s) => s.trim()).filter(Boolean) : []) {
      const optional = raw.endsWith("?");
      let step = optional ? raw.slice(0, -1).trim() : raw;
      // 🚨 `セレクタ @2` で「見えているもののうち 2 番目」を押せる（1 始まり）。
      //    由来: 2026-08-15。右パネルにアコーディオンが 3 つ並んでおり、
      //    3 つ目（ログ・履歴）だけを開く手段が無く、**中身を一度も測れなかった**。
      let nth = 1;
      const atMatch = step.match(/\s+@(\d+)$/);
      if (atMatch) { nth = Number(atMatch[1]); step = step.slice(0, atMatch.index).trim(); }
      const clicked = await cdp.send("Runtime.evaluate", {
        expression: `(() => {
          const all = [...document.querySelectorAll(${JSON.stringify(step)})];
          const shown = all.filter((e) => e.checkVisibility() && e.getBoundingClientRect().width > 0);
          const el = shown[${nth} - 1];
          if (!el) return all.length ? "HIDDEN_ONLY(" + all.length + "/見えている " + shown.length + ")" : "NOT_FOUND";
          // 🚨 **Radix は pointerdown で開く。** el.click() だけではメニュー・ダイアログが開かない
          //    （2026-08-15 実測: トリガーは見えているのに dropdown-menu-content が 0 件のままだった）。
          //    そのせいで **メニューとダイアログの中は、監査が一度も見ていない領域**になっていた。
          const o = { bubbles: true, cancelable: true, composed: true, pointerId: 1, isPrimary: true, button: 0 };
          try { el.dispatchEvent(new PointerEvent("pointerdown", o)); } catch {}
          try { el.dispatchEvent(new PointerEvent("pointerup", o)); } catch {}
          el.click();
          return el.tagName + ":" + (el.textContent || "").trim().slice(0, 20); })()`,
        returnByValue: true,
      });
      const v = clicked.result.value;
      if (optional && (v === "NOT_FOUND" || String(v).startsWith("HIDDEN_ONLY"))) {
        log(`     押した要素: （${step} は この画面幅に無いので飛ばしました）`);
        continue;
      }
      log(`     押した要素: ${v}`);
      if (v === "NOT_FOUND" || String(v).startsWith("HIDDEN_ONLY")) {
        violations.push({
          key, rule: "測定不能",
          detail: v === "NOT_FOUND"
            ? `--click の対象が見つかりません: ${step}`
            : `--click の対象が見つかりましたが、すべて画面に出ていません: ${step}`,
        });
        clickFailed = true;
        break;
      }
      await sleep(800); // 開くアニメーションの待ち
    }
    if (clickFailed) continue;

    if (CLIPBOARD && clipboardAudit) {
      if (clipboardAudit.initialized.ok) {
        const read = await readClipboard(cdp);
        clipboardAudit.read = read;
        if (read.ok) {
          log(`     クリップボード: ${formatClipboardValue(read.value)}`);
        } else {
          log(`     クリップボード: 読めなかった（${read.reason}）`);
          violations.push({
            key,
            rule: "測定不能",
            detail: `clipboard を読めません: ${read.reason}`,
          });
        }
      } else {
        clipboardAudit.read = { ok: false, reason: "初期化に失敗したため読み取り結果を信用できません" };
      }
    }

    // 🚨 --file があれば、隠れている file input に実際のファイルを載せて change を起こす。
    if (FILE) {
      const doc = await cdp.send("DOM.getDocument", { depth: -1 });
      const found = await cdp.send("DOM.querySelector", {
        nodeId: doc.root.nodeId, selector: 'input[type=file]',
      });
      if (!found.nodeId) {
        log(`     ファイル: input[type=file] が見つかりません`);
        violations.push({ key, rule: "測定不能", detail: "--file の対象 input[type=file] がありません" });
        continue;
      }
      await cdp.send("DOM.setFileInputFiles", { nodeId: found.nodeId, files: [FILE] });
      log(`     ファイル: ${FILE.split("/").pop()} を載せました`);
      await sleep(700);
    }
    // 🚨 キーを押して焦点の動きを測る。
    if (KEYS) {
      const seen = [];
      const active = async () => {
        const r2 = await cdp.send("Runtime.evaluate", {
          expression: `(() => { const a = document.activeElement;
            return a ? a.tagName + ":" + (a.getAttribute("data-slot") || a.className || "").toString().slice(0, 24)
                       + ":" + (a.textContent || "").trim().slice(0, 16) : "(なし)"; })()`,
          returnByValue: true,
        });
        return r2.result.value;
      };
      seen.push(await active());
      for (const k of KEYS.split(",").map((x) => x.trim()).filter(Boolean)) {
        await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code: k, windowsVirtualKeyCode: KEYCODE[k] ?? 0 });
        await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: k, windowsVirtualKeyCode: KEYCODE[k] ?? 0 });
        await sleep(180);
        seen.push(await active());
      }
      log(`     焦点の移動: ${seen.join("  →  ")}`);
      if (new Set(seen).size === 1) {
        violations.push({ key, rule: "§7 キーボードで移動できない", detail: `${KEYS} を押しても焦点が動きません（${seen[0]}）` });
      }
    }

    const renderSnapshotResult = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const rawText = document.body ? document.body.innerText : "";
        const text = rawText.replace(/\\s+/g, " ").trim();
        return {
          url: location.pathname,
          title: document.title,
          text: rawText.slice(0, 400),
          textChars: text.length,
        };
      })()`,
      returnByValue: true,
    });
    const renderSnapshot = renderSnapshotResult.result.value ?? {};
    const renderEvents = cdp.peekEvents();
    const renderExceptions = renderEvents.filter((event) =>
      event.startsWith("例外:") || event.includes("Inspector.targetCrashed"));

    if (DUMP) {
      const v = renderSnapshot;
      log(`     画面: ${v.url} / ${v.title}\n     ${String(v.text ?? "").replace(/\n+/g, " ⏎ ").slice(0, 300)}`);
      for (const e of renderEvents.slice(-6)) log(`     画面側: ${e}`);
    }
    const probed = await cdp.send("Runtime.evaluate", { expression: PROBE, returnByValue: true });
    const r = probed.result.value;
    // 🚨 PROBE が投げたときに undefined を素通しさせない。
    //    以前は r.maxDepth を読んで TypeError で落ち、**何が起きたか一切分からなかった**。
    //    検査は「落ちる」より「なぜ落ちたか言って違反に数える」方が使える。
    if (!r) {
      const why = probed.exceptionDetails?.exception?.description
        ?? probed.exceptionDetails?.text
        ?? "理由不明（PROBE が値を返しませんでした）";
      log(`  🚨 ${key}: 測定できません → ${why.split("\n")[0]}`);
      violations.push({ key, rule: "測定不能", detail: `画面内の測定が失敗しました: ${why.split("\n")[0]}` });
      continue;
    }
    const renderLivenessReasons = [];
    if (renderExceptions.length) {
      renderLivenessReasons.push(`画面側の例外 ${renderExceptions.length} 件: ${renderExceptions.slice(0, 2).join(" / ")}`);
    }
    if (String(renderSnapshot.title ?? "").trim().length === 0) {
      renderLivenessReasons.push("document.title が空");
    }
    if ((renderSnapshot.textChars ?? r.renderTextChars ?? 0) < MIN_RENDER_TEXT_CHARS) {
      renderLivenessReasons.push(`本文の可視テキストが ${renderSnapshot.textChars ?? r.renderTextChars ?? 0} 文字（しきい値 ${MIN_RENDER_TEXT_CHARS} 未満）`);
    }
    r.renderTitle = renderSnapshot.title ?? "";
    r.renderTextChars = renderSnapshot.textChars ?? r.renderTextChars ?? 0;
    r.renderLivenessReasons = renderLivenessReasons;
    if (CLIPBOARD) r.clipboard = clipboardAudit;
    report[key] = r;

    if (MEASURE) {
      const measured = await cdp.send("Runtime.evaluate", {
        expression: measureExpression(MEASURE),
        returnByValue: true,
      });
      const m = measured.result.value;
      r.measure = m;
      if (m.invalid) {
        log(`     測定 ${m.selector}: セレクタが不正です（${m.error}）`);
      } else if (m.count === 0 && renderLivenessReasons.length > 0) {
        // 🚨 **「ページに無い」と「ページが取れていない」を同じ文言にしない**（2026-08-15）。
        //    実測: 存在しないパスを測っても、在るページで外れたときと**1バイトも同じ出力**だった。
        //    生存確認は別の違反として出ていたが、`測定` の行だけを読む人は
        //    「この要素は無い」と読む。**取りに行けていないのか、行った先に無いのか**は別の話。
        log(
          `     測定 ${m.selector}: 🚨 測れていない（ページが描画されていません: ` +
            `${renderLivenessReasons.join(" / ")}）。**この行を「要素が無い」と読まないこと**`,
        );
      } else if (m.count === 0) {
        log(`     測定 ${m.selector}: 当たらなかった（ページは描画されている / DOM一致 ${m.totalMatches} 件 / 見えている要素 0 件）`);
      } else {
        log(`     測定 ${m.selector}: ${m.count} 件（DOM一致 ${m.totalMatches} 件）`);
        for (const item of m.items) {
          const textBox = item.textBox
            ? `文字 top=${item.textBox.top}px h=${item.textBox.height}px`
            : "文字 なし";
          const space = item.space
            ? `余白 上=${item.space.top}px 下=${item.space.bottom}px 左=${item.space.left}px`
            : "余白 不明";
          log(
            `       - ${item.sel} "${item.text}" ` +
            `箱 top=${item.box.top}px h=${item.box.height}px w=${item.box.width}px ` +
            `${textBox} ${space} font=${item.fontSize}px line=${item.lineHeight}`,
          );
        }
      }
    }

    if (renderLivenessReasons.length) {
      violations.push({
        key,
        rule: "🚨 描画されていない",
        detail: renderLivenessReasons.join(" / "),
      });
    }

    // 🚨 読み上げ名を測る。**寸法と面しか見ていなかった穴**を塞ぐ（2026-08-14）。
    //    由来: base2 が CDP の Accessibility ドメインで実測してみせた。依存は0本。
    //    🚨 `getAttribute("aria-labelledby")` を読むだけでは**参照先が実在するか分からない**
    //       （settings の htmlFor が存在しない id を指していた事故と同じ形）。
    //       ここでは**ブラウザが計算した結果**（AXNode.name）を採るので、宙に浮いた参照は空になる。
    // 🚨 PC でだけ見る。SP は画面幅いっぱいが正しい（狭めると押しにくい）。
    if (!vp.mobile && r.tooWideInputs && r.tooWideInputs.length > 0) {
      violations.push({
        key, rule: "§3 入力が横に長すぎる",
        detail: `${r.tooWideInputs.length} 箇所が 720px を超えています（そのフィールドに入る文字数に合わせること）`,
        worst: r.tooWideInputs.slice(0, 4),
      });
    }
    if (r.editableLooking && r.editableLooking.length) {
      violations.push({
        key, rule: "§3 変えられない値が入力欄に見えている",
        detail: `${r.editableLooking.length} 箇所が readOnly なのに塗りか罫線を持っています（編集できると誤解させます）`,
        worst: r.editableLooking.slice(0, 4),
      });
    }
    if (r.nameless && r.nameless.length) {
      const bad = [];
      for (const cand of r.nameless.slice(0, 40)) {
        const doc = await cdp.send("DOM.getDocument", { depth: -1 });
        const found = await cdp.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: cand.q });
        if (!found.nodeId) continue;
        // 🚨 `fetchRelatives` を落とさないこと。既定だと**祖先や子のノードまで返る**ので、
        //    `.find()` が別の要素を掴み、**aria-label を持つ正しい実装を「名前が無い」と報告する**
        //    （2026-08-14 実測。報告の直前に気づいた8件目の誤検出）。
        const ax = await cdp.send("Accessibility.getPartialAXTree", {
          nodeId: found.nodeId, fetchRelatives: false,
        });
        const node = (ax.nodes || [])[0];
        // 🚨 **読み上げから外されている要素は対象外**。名前が無いのは当たり前で、欠陥ではない。
        //    実測: ドロワー（Sheet）を開くと背後の全体が inert / aria-hidden になり、
        //    aria-label を持つボタンまで ignored になる。**モーダルとして正しい挙動**。
        //    ここを見落とすと、正しい実装を「名前が無い」と報告する（今夜8件目の誤検出）。
        if (node?.ignored) continue;
        const name = node?.name?.value?.trim() ?? "";
        if (!name) bad.push({ sel: cand.sel, html: cand.html });
      }
      if (bad.length) {
        violations.push({
          key, rule: "§7 読み上げ名が無い",
          detail: `${bad.length} 個の操作部品に読み上げ名がありません（画面に文字が無く、aria も付いていない）`,
          worst: bad.slice(0, 4),
        });
      }
    }

    if (r.maxDepth > MAX_DEPTH) {
      violations.push({ key, rule: "§1 面の入れ子", detail: `深さ ${r.maxDepth}（上限 ${MAX_DEPTH}）`, worst: r.nested.slice(0, 3) });
    }
    if (r.overflowX > 0) violations.push({ key, rule: "§7 横あふれ", detail: `${r.overflowX}px はみ出している` });
    // 🚨 書体。日本語を持つ製品なので、CJK を持つ書体が先頭に来ていること。
    // 🚨 next/font が生成する名前は空白もハイフンも持たない（実測: `notoSansJP`）。
    //    人が読む綴りだけを見ていると、**正しく当たっている書体を「指定なし」と報告する**
    //    （2026-08-15 実測。12件目の誤検出）。区切りを問わずに見る。
    if (!/noto[\s_-]*sans[\s_-]*(jp|cjk)|hiragino|yu[\s_-]*gothic|meiryo|biz[\s_-]*ud/i.test(r.fontFamily)) {
      violations.push({ key, rule: "書体", detail: `日本語向けの書体が指定されていません: ${r.fontFamily}` });
    }
    // 🚨 本文の幅。潰れの別角度からの検出（body / main が画面幅に対して極端に狭くないか）。
    if (r.bodyWidth < r.viewportWidth * 0.9) {
      violations.push({ key, rule: "本文の幅", detail: `body が ${r.bodyWidth}px（画面幅 ${r.viewportWidth}px の 90% 未満）` });
    }
    // 🚨 「潰れ」は最優先。壊れていても他の検査は全部通ってしまうため（2026-08-13 の実例）。
    if (r.misalignedCount > 0) {
      violations.push({
        key, rule: "§1 行の揃い",
        detail: `${r.misalignedCount} 箇所で、高さは同じなのに文字の縦位置がずれています（align-items の指定漏れ）`,
        worst: r.misaligned.slice(0, 3),
      });
    }
    if (r.doubledRulesCount > 0) {
      violations.push({
        key, rule: "§1 区切りが重複している",
        detail: `${r.doubledRulesCount} 箇所で線が2本重なっています（隣り合う面が上下に罫線を持つと起きます）`,
        worst: r.doubledRules.slice(0, 3),
      });
    }
    if (r.collapsedCount > 0) {
      violations.push({
        key, rule: "🚨 レイアウトが潰れている",
        detail: `${r.collapsedCount} 箇所。幅が足りず、文字が読めない状態になっています`,
        worst: r.collapsed.slice(0, 4),
      });
    }
    if (r.scrollersWithoutFade > 0) {
      violations.push({ key, rule: "§6 scroll-fade", detail: `${r.scrollersWithoutFade} 箇所がスクロールするのに fade が無い`, worst: r.scrollers.filter((s) => !s.faded).slice(0, 3) });
    }
    if (vp.mobile) {
      // ナビは管理画面の中でだけ要る。/login や /（公開ページ）にナビが無いのは正しい。
      if (path.startsWith("/admin") && r.navLinks === 0 && !r.hasBottomNav) {
        violations.push({ key, rule: "§7 SP ナビ", detail: "表示されているナビが 0（下部ナビも無い）" });
      }
      if (r.zoomingInputs.length > 0) {
        violations.push({ key, rule: "§7 16px 未満の入力", detail: `${r.zoomingInputs.length} 箇所（iOS が勝手に拡大する）`, worst: r.zoomingInputs.slice(0, 3) });
      }
      // 🚨 SP は 44px を**違反**にする。24px は WCAG AA の法的下限であって設計目標ではない。
      // 由来: 2026-08-13 堀池さん「ボタンの高さが狭い / input タグの高さも狭い」。
      // design が一度 24px へ緩めたが、それが「指摘済みなのに直っていない」を作った。
      // 参考にしている X iOS / Coinbase iOS / Believe iOS は**すべて SP**。Apple HIG も 44pt。
      if (r.tapTargetsUnder44.length > 0) {
        violations.push({
          key, rule: "§7 タップ領域（SP）",
          detail: `${r.tapTargetsUnder44.length} 箇所が 44px 未満（うち ${r.tapTargetsUnder24.length} 箇所は WCAG 2.5.8 の 24px すら割っている）`,
          worst: r.tapTargetsUnder44.slice(0, 4),
        });
      }
    } else {
      // 🚨 同じ form の中だけで比べる（ページ全体の最大同士だと誤検出する）。
      if (r.formPairs.length > 0) {
        violations.push({
          key, rule: "§3 ボタンの高さ",
          detail: `${r.formPairs.length} 件のフォームで、ボタンが入力より高いです（ボタンが入力より高くならないこと。同じ高さは正しい。全幅の主要アクションは対象外）`,
          worst: r.formPairs.slice(0, 2),
        });
      }
    }

    if (SHOTS) {
      const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
      writeFileSync(`${SHOTS}/${vp.name}${path.replace(/\//g, "_")}.png`, Buffer.from(shot.data, "base64"));
    }
    log(`  ${vp.name.padEnd(2)} ${path.padEnd(30)} 深さ=${r.maxDepth} ナビ=${r.navLinks} あふれ=${r.overflowX}px ${r.loadMs ?? "?"}ms`);
  }
}

cdp.close();
cleanupChrome();

// 🚨 **「測れなかった」を緑にしない。**
//    2026-08-15 まで、この監査は「行のあるコレクションを 1 度も測らずに」違反なしと言えた。
//    ——それで本番停止級の 500 が居座った。**測れていないなら、そう言って落ちる。**
const notMeasured = fixtures && fixtures.blocking ? fixtures : null;

if (AS_JSON) {
  console.log(JSON.stringify({ base: BASE, discovery, fixtures, report, violations }, null, 2));
  if (notMeasured) process.exit(1);
} else {
  console.log(`\n対象: ${PATHS.length} ページ × ${VIEWPORTS.length} 画面幅 = ${PATHS.length * VIEWPORTS.length} 回測定（${BASE}）`);
  // 🚨 **測っていないものは、末尾の集計に1行で出す**（design 指示 2026-08-15）。
  //    途中のログに出すだけでは `missing` の 🚨見つからず と同じで、誰にも読まれずに exit 0 で流れる。
  //    **違反の有無に関わらず出す**（これは合否ではなく「どこまで見たか」の話なので）。
  if (fixtures?.pagedMissing) {
    console.log(`測っていない: ページ送りのある一覧（${fixtures.pagedMissingWhy}）`);
  }
  // 🚨 発見できなかった動的ルートも、同じ場所に同じ書式で出す（design 2026-08-15）。
  //    以前はここへ出しておらず、途中のログの 🚨見つからず だけだったので誰にも読まれなかった。
  if (discovery?.missing?.length) {
    const names = discovery.missing.map((m) => m.label).join(" / ");
    console.log(`測っていない: 動的ルート ${discovery.missing.length} 種類（実データが無いか、一覧から辿れない）— ${names}`);
  }
  if (!SESSION) console.log("⚠ --session を渡していないので、ログインが要るページは /login へ飛んでいる可能性があります。");
  // 🚨 **巡回が成立していない実行を「違反なし」で通さない。**
  //    一覧を開いたのに href が 1 件も取れないのは、データが無いのではなく**発見の段の故障**。
  //    ここを塞がないと「巡回対象が 0 件だった」と「巡回して違反が 0 件だった」が
  //    同じ出力・同じ終了コードになる（2026-08-15。この監査自身に開いていた「見ていない 0」）。
  //    `--paths` を明示したときは発見の段を走らせないので、この判定も走らない。
  if (discovery?.crawlFailed) {
    console.error("\n🚨 動的ルートの発見が成立していません: 一覧を巡回しましたが href が 1 件も取れませんでした。");
    console.error(`   検索元: ${discovery.byList.map((b) => b.path).join(" / ")}`);
    console.error("   この実行の「違反なし」は **静的なページについてだけ** の結果です。");
    console.error("   ログイン状態（--session）と、一覧ページが 200 を返すことを先に確かめてください。");
    process.exit(1);
  }
  if (notMeasured) {
    console.error(`\n🚨 測れませんでした: ${notMeasured.why}`);
    console.error("   この実行の「違反なし」は **データが空のときの結果** でしかありません。");
    console.error("   行のあるコレクションを用意してから測り直してください（上の「直し方」を参照）。");
    if (violations.length > 0) console.error(`   （そのうえで、測れた範囲では違反 ${violations.length} 件が出ています）`);
    process.exit(1);
  }
  if (violations.length === 0) {
    console.log("違反なし。");
  } else {
    console.error(`\n🚨 違反 ${violations.length} 件\n`);
    for (const v of violations) {
      console.error(`  [${v.rule}] ${v.key}`);
      console.error(`      ${v.detail}`);
      for (const w of v.worst ?? []) console.error(`        - ${JSON.stringify(w)}`);
    }
    console.error("\n  規則: .claude/design-perf-charter.md / knowledge/decisions/no-nested-surfaces.md");
    process.exit(1);
  }
}
