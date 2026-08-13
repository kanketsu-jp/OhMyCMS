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
 *     ・ボタンと入力の**実 px**（憲章 §3「ボタンは入力より低い」）
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

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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
// 🚨 開いている間しか存在しない箱（select の候補・command のリスト・dialog / sheet の本文）を測るための入口。
//    ページを開いただけでは DOM に無いので、**測る前にこれを押す**。
//    例: --click '[data-slot=global-search-trigger]'
const CLICK = arg("click", "");

const DEFAULT_PATHS = [
  "/admin",
  "/admin/collections",
  "/admin/files",
  "/admin/folders",
  "/admin/notifications",
  "/admin/settings/general",
  "/admin/settings/policies",
  "/admin/settings/users",
];
const PATHS = arg("paths", "").length
  ? arg("paths", "").split(",").map((s) => s.trim()).filter(Boolean)
  : DEFAULT_PATHS;

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
    if (el.matches(ACTION) && el.children.length <= 2) return null;

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

  const measure = (q) => [...document.querySelectorAll(q)].map((el) => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    if (r.height === 0) return null;
    return {
      sel: sel(el), h: Math.round(r.height * 10) / 10, w: Math.round(r.width),
      fs: Math.round(px(s.fontSize) * 10) / 10,
      label: (el.textContent || el.getAttribute("placeholder") || el.type || "").trim().slice(0, 20),
    };
  }).filter(Boolean);

  const buttons = measure("button, [data-slot=button]");
  const inputs = measure("input:not([type=hidden]), select, textarea");

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
  const withTarget = (list, q) => {
    const els = [...document.querySelectorAll(q)].filter((e) => e.getBoundingClientRect().height > 0);
    return list.map((item, i) => ({ ...item, h: els[i] ? Math.round(targetHeight(els[i]) * 10) / 10 : item.h }));
  };
  const buttonsT = withTarget(buttons, "button, [data-slot=button]");
  const inputsT = withTarget(inputs, "input:not([type=hidden]), select, textarea");

  // 🚨 「ボタンは入力より低い」は**ページ内フォームのボタン**の話（憲章 §3 の表）。
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
  const srOnly = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.clipPath !== "none" || cs.clip !== "auto") return true;
    }
    return false;
  };

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
    const r = el.getBoundingClientRect();
    if (r.width < 40) continue;
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
  const doubled = [];
  rules.sort((a, b) => a.y - b.y);
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
    //          → SP の主要アクションはここを狙う。全部に課すと「ボタンは入力より低い」と両立しないので、
    //            **違反にはせず参考値として数える**
    tapTargetsUnder24: [...buttonsT, ...inputsT].filter((x) => x.h < 24).map((x) => ({ h: x.h, fs: x.fs, sel: x.sel })),
    tapTargetsUnder44: [...buttonsT, ...inputsT].filter((x) => x.h < 44).map((x) => ({ h: x.h, fs: x.fs, sel: x.sel })),
    scrollers,
    scrollersWithoutFade: scrollers.filter((s) => !s.faded).length,
    overflowX: de.scrollWidth - de.clientWidth,
    navLinks: [...document.querySelectorAll("nav a, aside a")].filter((a) => a.getBoundingClientRect().width > 0).length,
    hasBottomNav: [...document.querySelectorAll("*")].some((el) => {
      const s = getComputedStyle(el);
      return (s.position === "fixed" || s.position === "sticky") && px(s.bottom) === 0 &&
             el.getBoundingClientRect().height > 20 && el.querySelectorAll("a,button").length >= 2;
    }),
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
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.rej(new Error(JSON.stringify(msg.error)));
    else p.res(msg.result);
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  return { ready, send, close: () => ws.close() };
}

// ── 実行 ────────────────────────────────────────────────────────────────
const { proc, page } = await launchChrome();
const cdp = connect(page.webSocketDebuggerUrl);
await cdp.ready;
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");
await cdp.send("Network.enable");

if (SESSION) {
  const { hostname } = new URL(BASE);
  await cdp.send("Network.setCookie", { name: "session", value: SESSION, domain: hostname, path: "/", httpOnly: true });
}
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const report = {};
const violations = [];

for (const vp of VIEWPORTS) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: vp.width, height: vp.height, deviceScaleFactor: vp.dsf, mobile: vp.mobile,
  });
  for (const path of PATHS) {
    await cdp.send("Page.navigate", { url: BASE + path });
    // 🚨 固定待ちにしない。dev サーバは初回アクセスでルートをコンパイルするので、
    //    固定 1500ms だと**前のページを測ってしまい、実行のたびに深さが変わる**（実測で判明）。
    //    「読み込み完了」かつ「URL が目的地」になるまで待つ。
    const target = new URL(BASE + path).pathname;
    let settled = false;
    let landed = target;
    for (let i = 0; i < 40; i++) {
      const { result } = await cdp.send("Runtime.evaluate", {
        expression: `({ ready: document.readyState, path: location.pathname })`,
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
    if (!settled) {
      const why = landed === "/login"
        ? "ログインしていません（--session のトークンが切れている可能性）"
        : `別の場所に着きました: ${landed}`;
      console.error(`  🚨 ${vp.name} ${path}: ${why} → この行は測定していません`);
      report[`${vp.name} ${path}`] = { skipped: true, landed };
      violations.push({ key: `${vp.name} ${path}`, rule: "測定不能", detail: why });
      continue;
    }
    await sleep(400); // 描画の落ち着き待ち

    // 🚨 --click があれば押してから測る。押せたかどうかを**必ず出力**する
    //    （押せていないのに緑が出るのが、いちばん危ない）。
    if (CLICK) {
      const clicked = await cdp.send("Runtime.evaluate", {
        expression: `(() => { const el = document.querySelector(${JSON.stringify(CLICK)});
          if (!el) return "NOT_FOUND"; el.click();
          return el.tagName + ":" + (el.textContent || "").trim().slice(0, 20); })()`,
        returnByValue: true,
      });
      log(`     押した要素: ${clicked.result.value}`);
      if (clicked.result.value === "NOT_FOUND") {
        violations.push({ key, rule: "測定不能", detail: `--click の対象が見つかりません: ${CLICK}` });
        continue;
      }
      await sleep(800); // 開くアニメーションの待ち
    }
    const { result } = await cdp.send("Runtime.evaluate", { expression: PROBE, returnByValue: true });
    const r = result.value;
    const key = `${vp.name} ${path}`;
    report[key] = r;

    if (r.maxDepth > MAX_DEPTH) {
      violations.push({ key, rule: "§1 面の入れ子", detail: `深さ ${r.maxDepth}（上限 ${MAX_DEPTH}）`, worst: r.nested.slice(0, 3) });
    }
    if (r.overflowX > 0) violations.push({ key, rule: "§7 横あふれ", detail: `${r.overflowX}px はみ出している` });
    // 🚨 書体。日本語を持つ製品なので、CJK を持つ書体が先頭に来ていること。
    if (!/Noto Sans JP|Noto Sans CJK|Hiragino|Yu Gothic|Meiryo|BIZ UD/i.test(r.fontFamily)) {
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
      // 全幅の主要アクションは除いた「ページ内フォームのボタン」だけで比べる（憲章 §3 の表）。
      const b = r.inlineButtonHeights.at(-1), i = r.inputHeights.at(-1);
      if (b != null && i != null && b >= i) {
        violations.push({ key, rule: "§3 ボタンの高さ", detail: `フォーム内のボタン ${b}px >= 入力 ${i}px（ボタンは入力より低いこと。全幅の主要アクションは対象外）` });
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
proc.kill();

if (AS_JSON) {
  console.log(JSON.stringify({ base: BASE, report, violations }, null, 2));
} else {
  console.log(`\n対象: ${PATHS.length} ページ × ${VIEWPORTS.length} 画面幅 = ${PATHS.length * VIEWPORTS.length} 回測定（${BASE}）`);
  if (!SESSION) console.log("⚠ --session を渡していないので、ログインが要るページは /login へ飛んでいる可能性があります。");
  if (violations.length === 0) {
    console.log("違反なし。");
  } else {
    console.error(`\n🚨 違反 ${violations.length} 件\n`);
    for (const v of violations) {
      console.error(`  [${v.rule}] ${v.key}`);
      console.error(`      ${v.detail}`);
      for (const w of v.worst ?? []) console.error(`        - ${JSON.stringify(w)}`);
    }
    console.error("\n  規則: .claude/design-perf-charter.md / docs/design/surface-rules.md");
    process.exit(1);
  }
}
