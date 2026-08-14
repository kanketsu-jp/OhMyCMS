/**
 * 下書きの「送信 → 着地」の決着ロジックを、**実際に走らせて**確かめる。
 *
 *   node scripts/verify-form-draft-logic.mjs
 *
 * なぜ要るか:
 * この部分はブラウザでしか動かないが、**ブラウザ検証の環境がまだ無い**。
 * かといってコードを読んで「たぶん動く」で済ませると、実際に一度間違えた:
 * 🚨 最初の実装は「保存が成功したページで下書きを消す」形だった。**成立しない。**
 *    保存の成功は /admin/content/<collection>?notice=… へ着地するが、
 *    **その一覧ページに <FormDraft> は無い**（実測 0 件）ので判定する主体が居ない。
 *    下書きは永久に残り、次にそのレコードを開くと「保存済みの内容」を復元しますかと聞かれる。
 *
 * → いまの形: **送信した時点で消し、中身は sessionStorage へ退避**。
 *   失敗して ?error= で着地したら**元の鍵へ書き戻す**（着地先に部品があるかに依存しない）。
 *
 * 🚨 この検査が効くことは、**直す前の形に戻すと 2 件赤くなる**ことで確認済み（2026-08-15）。
 */
// 🚨 コードを読んで「たぶん動く」で済ませないため。localStorage / sessionStorage を模す。
const PENDING_KEY = "ohmycms:draft:pending";
const local = new Map(), session = new Map();

function markSubmitting(draftKey) {
  const values = local.get(draftKey) ?? null;
  if (values !== null) { session.set(PENDING_KEY, JSON.stringify({ key: draftKey, values })); local.delete(draftKey); }
}
function readPending() {
  const raw = session.get(PENDING_KEY); if (!raw) return null;
  try { const p = JSON.parse(raw); return typeof p?.key === "string" && typeof p?.values === "string" ? p : null; } catch { return null; }
}
function restorePendingDraft() { const p = readPending(); if (!p) return; local.set(p.key, p.values); session.delete(PENDING_KEY); }
function resolvePendingDraft(search) {
  const p = readPending(); if (!p) return;
  if (new URLSearchParams(search).has("error")) { restorePendingDraft(); return; }
  session.delete(PENDING_KEY);
}

let fails = 0;
const eq = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}: ${JSON.stringify(got)}${ok ? "" : ` （期待 ${JSON.stringify(want)}）`}`); };

const KEY = "ohmycms:draft:/admin/content/posts/abc:item-form";

// ① 保存が成功し、FormDraft の無い一覧へ着地する（今回直した本題）
local.clear(); session.clear(); local.set(KEY, '{"title":"下書き"}');
markSubmitting(KEY);
eq("🚨 送信した時点で下書きは消える", local.has(KEY), false);
resolvePendingDraft("?notice=item_saved");   // ← 一覧に FormDraft は無いので本当は走らない
eq("成功後に退避も残らない", session.has(PENDING_KEY), false);
eq("下書きは消えたまま", local.has(KEY), false);

// ②「着地先に FormDraft が無い」場合でも消えていること（直す前の壊れ方）
local.clear(); session.clear(); local.set(KEY, '{"title":"下書き"}');
markSubmitting(KEY);
eq("🚨 判定が一度も走らなくても下書きは残らない", local.has(KEY), false);

// ③ 保存に失敗して元の画面へ戻る
local.clear(); session.clear(); local.set(KEY, '{"title":"下書き"}');
markSubmitting(KEY);
resolvePendingDraft("?error=invalid_input");
eq("🚨 失敗したら入力が戻る", local.get(KEY), '{"title":"下書き"}');
eq("退避は消える", session.has(PENDING_KEY), false);

// ④ 失敗の行き先が別ページでも、元の鍵へ戻る
local.clear(); session.clear(); local.set(KEY, '{"title":"下書き"}');
markSubmitting(KEY);
resolvePendingDraft("?error=forbidden");     // 一覧で着地したつもり
eq("🚨 別ページで着地しても元の鍵へ戻る", local.get(KEY), '{"title":"下書き"}');

// ⑤ 別レコードの下書きと混ざらない
local.clear(); session.clear();
local.set(KEY, '{"title":"A"}'); local.set("ohmycms:draft:/admin/content/posts/xyz:item-form", '{"title":"B"}');
markSubmitting(KEY); resolvePendingDraft("?notice=item_saved");
eq("🚨 別レコードの下書きは触らない", local.get("ohmycms:draft:/admin/content/posts/xyz:item-form"), '{"title":"B"}');

// ⑥ 壊れた退避で落ちない
local.clear(); session.clear(); session.set(PENDING_KEY, "{壊れている");
resolvePendingDraft("?error=x");
eq("壊れた退避は無視される", session.has(PENDING_KEY), true);

console.log(`\n測った条件: 10 / 食い違い: ${fails} 件`);
process.exit(fails ? 1 : 0);
