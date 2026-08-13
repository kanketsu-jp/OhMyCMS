#!/usr/bin/env node
/**
 * `<RichText>` を**実際に描画して**、危険な入力が安全側に落ちることを確かめる。
 *
 * 🚨 これは「型が通る」ではなく「**描いた結果に何が出るか**」を見る検査。
 *   今日、対照や比較の側が壊れていて誤った結論を出したことが3回あったので、
 *   **出力そのものを見る**形にしている。
 *
 * 🚨 対照つき: **安全な入力がちゃんと描かれること**を先に確かめる。
 *   それが無いと「何も描かない実装」でも危険な入力の検査は全部通ってしまう。
 *
 * 使い方: node scripts/richtext-smoke.mjs
 */

import { renderToStaticMarkup } from "react-dom/server";

import { RichText } from "../dist/next/richtext.js";

const results = [];
const check = (label, ok, detail) => {
  results.push({ label, ok, detail });
  console.log(`  ${ok ? "✅" : "❌"} ${label}${detail ? `: ${detail}` : ""}`);
};

const render = (doc) => renderToStaticMarkup(RichText({ doc, className: "prose" }));

const text = (value, marks) => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
const para = (...content) => ({ type: "paragraph", content });
const doc = (...content) => ({ type: "doc", content });

console.log("🟢 対照: 安全な入力はちゃんと描かれる（これが無いと以下は何も証明しない）");
{
  const html = render(
    doc(
      { type: "heading", attrs: { level: 2 }, content: [text("見出し")] },
      para(text("ふつうの文章"), text("太字", [{ type: "bold" }])),
      para(text("リンク", [{ type: "link", attrs: { href: "https://example.com" } }])),
      { type: "bulletList", content: [{ type: "listItem", content: [para(text("項目"))] }] },
    ),
  );
  check("見出し・段落・太字が出る", /<h2>見出し<\/h2>/.test(html) && /<strong>太字<\/strong>/.test(html), html.slice(0, 60));
  check("正しいリンクは <a href> になる", /<a href="https:\/\/example\.com"[^>]*>リンク<\/a>/.test(html));
  check("箇条書きが出る", /<ul><li><p>項目<\/p><\/li><\/ul>/.test(html));
}

console.log("\n🔴 危険な入力は安全側に落ちる");
{
  // 🚨 javascript: と、制御文字を挟んだ偽装
  const html = render(
    doc(
      para(text("押すな", [{ type: "link", attrs: { href: "javascript:alert(1)" } }])),
      para(text("押すな2", [{ type: "link", attrs: { href: "java\tscript:alert(1)" } }])),
      para(text("押すな3", [{ type: "link", attrs: { href: "//evil.example/x" } }])),
    ),
  );
  check("javascript: の href はリンクにならない（文字は残る）",
    !/javascript:/i.test(html) && html.includes("押すな"), html.slice(0, 80));
  check("制御文字を挟んだ偽装も弾く（java\\tscript:）", !/script:/i.test(html));
  check("protocol-relative（//evil）も弾く", !/\/\/evil/.test(html));
}
{
  const html = render(
    doc(
      { type: "image", attrs: { src: "https://evil.example/track.gif", alt: "x" } },
      { type: "image", attrs: { src: "/api/assets/00000000-0000-4000-8000-000000000000", alt: "ok" } },
    ),
  );
  check("外部URLの画像は描かない", !/evil\.example/.test(html), html.slice(0, 90));
  check("自分のアセットは描く（対照）", /\/api\/assets\/00000000-0000-4000-8000-000000000000/.test(html));
}
{
  // 🚨 知らない種類は描かない（許可リスト方式）
  const html = render(doc({ type: "script", content: [text("window.__pwned=1")] }, para(text("残る"))));
  check("知らない type は描かない", !/__pwned/.test(html) && html.includes("残る"), html);
}
{
  // 🚨 本文が無い・壊れていてもページを落とさない
  const empty = render(null);
  const broken = render({ type: "doc", content: [{ nope: true }, null] });
  check("null でも例外にならない", empty === "", JSON.stringify(empty));
  check("壊れた中身でも例外にならない", typeof broken === "string", JSON.stringify(broken).slice(0, 60));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n===== ${results.length - failed.length}/${results.length} 通過 =====`);
if (failed.length > 0) {
  for (const f of failed) console.log("  ❌", f.label, f.detail ?? "");
  process.exit(1);
}
