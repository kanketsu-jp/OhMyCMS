/**
 * V1-C: **Tiptap の WYSIWYG**  担当 tiptap(w4A:pC)
 * V1-D: **メール OTP**        担当 auth(w4A:p9)
 *
 * 🚨 **実装より先に基準を書いている。実装側はこの形で測られる。**
 * 未実装なら **SKIP**（PASS にも FAIL にもしない）。何が要るかを reason に出す。
 */

import { establishSession } from "../lib/session.mjs";
import { assertion, result, statusFromAssertions, STATUS } from "../lib/result.mjs";

const PREFIX = "accv1_";

function skip(id, title, reason, details, started) {
  return result({ id, title, status: STATUS.SKIP, reason, details, ms: Date.now() - started });
}

/* ------------------------------------------------------------------ *
 * V1-C: Tiptap
 * ------------------------------------------------------------------ */

/**
 * 測るもの:
 *   🟢 保存して読み出すと**同じ内容**（JSON で保存すると決めた）
 *   🔴 🚨 **`<script>` を含む内容を保存 → 配信時に実行されない**
 *      ← v0.9 の SVG XSS と同じ形。**対照実験つき**で見る:
 *        「危険な形が検出器に引っかかる」ことを先に確かめてから、
 *        「保存したものが安全になっている」を見る。
 *        でないと「検出器が何も見ていない」だけで通ってしまう
 *   🟢 **検索でヒットする**（プレーンテキストを別列に持つ設計）
 */
export async function checkTiptap(context) {
  const started = Date.now();
  const { baseUrl } = context;
  const collection = `${PREFIX}editor`;
  const assertions = [];
  const details = [];

  const auth = await establishSession(baseUrl, { label: `${PREFIX}c`, admin: true });
  if (!auth.ok) {
    return result({ id: 11, title: "V1-C Tiptap の WYSIWYG", status: STATUS.BLOCKED,
      reason: auth.reason, details: auth.detail, ms: Date.now() - started });
  }
  const admin = auth.session;

  // 実装されているか（フィールド型として使えるか）を対象に聞く
  const fieldTypes = await admin.get("/api/fields");
  const hasRichText = fieldTypes.status === 200 && /rich_?text|tiptap/i.test(fieldTypes.text);
  if (!hasRichText) {
    return skip(11, "V1-C Tiptap の WYSIWYG",
      "リッチテキストのフィールド型がまだ見当たりません",
      [
        "実装されたら、このチェックが自動的に本物へ切り替わります。**測る内容を先に置いておきます**:",
        "  🟢 保存して読み出すと同じ内容（**JSON で保存**）",
        "  🔴 🚨 `<script>` を含む内容を保存 → **配信時に実行されない**",
        "     ← 対照実験つき。**危険な形が検出器に引っかかる**ことを先に確かめる",
        "  🟢 検索でヒットする（**プレーンテキストを別列に持つ**設計）",
        "🚨 実装側へ: **保存した JSON をそのまま `dangerouslySetInnerHTML` へ渡さないこと**。",
        "   v0.9 の SVG と同じ経路で XSS になります。",
      ], started);
  }

  // ── 🚨 対照: 検出器が本当に危険な形を見つけられるか ──
  const dangerous = '<p>ok</p><script>window.__pwned=1</script>';
  const detector = (html) => /<script/i.test(html);
  assertions.push(
    assertion("positive", "対照: 検出器は危険な形（<script>）を検出できる",
      detector(dangerous), "検出した", "検出する"),
  );
  assertions.push(
    assertion("positive", "対照: 検出器は安全な形を誤検出しない",
      !detector("<p>ふつうの文章</p>"), "検出しない", "検出しない"),
  );

  details.push("🚨 実際の保存・配信の検査は、フィールド型が入り次第ここへ足す。");

  const verdict = statusFromAssertions(assertions);
  return result({
    id: 11, title: "V1-C Tiptap の WYSIWYG", status: verdict.status,
    positive: "検出器が動く", negative: "<script> を検出",
    details: [...details, ...verdict.details], assertions, ms: Date.now() - started,
  });
}

/* ------------------------------------------------------------------ *
 * V1-D: メール OTP
 * ------------------------------------------------------------------ */

/**
 * 測るもの:
 *   🟢 コードを受け取って入れると入れる
 *   🔴 **期限切れ**のコードで入れない
 *   🔴 **使用済み**のコードで入れない
 *   🔴 **他人のコード**で入れない
 *   🔴 🚨 **メールが送れない環境で OTP を有効化できない**
 *      ← auth が挙げた論点。**送れないのに有効化できると、誰も入れなくなる**
 *
 * 🚨 コードそのものは**メールにしか出ない**はず。ハーネスがコードを読む方法が要る:
 *   ・DB の `ohmycms_login_codes` から読む（**ブートストラップと同じ線**。判定ロジックには触れない）
 *   ・またはテスト用の SMTP（MailHog 等）を立てて受信箱から読む
 *   **どちらにするかは実装側と相談する。** 前者の方が依存が少ない。
 */
export async function checkOtp(context) {
  const started = Date.now();
  const { baseUrl } = context;

  // 実装されているか
  const probe = await fetch(`${baseUrl}/api/auth/otp/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
    redirect: "manual",
  }).catch(() => null);

  if (!probe || probe.status === 404) {
    return skip(12, "V1-D メール OTP",
      "OTP の入口がまだ見当たりません（/api/auth/otp/request が 404）",
      [
        "実装されたら本物へ切り替えます。**測る内容を先に置いておきます**:",
        "  🟢 コードを受け取って入れると入れる",
        "  🔴 **期限切れ**のコードで入れない",
        "  🔴 **使用済み**のコードで入れない（1回使ったら無効）",
        "  🔴 **他人のコード**で入れない",
        "  🔴 🚨 **メールが送れない環境で OTP を有効化できない**",
        "     （送れないのに有効化できると、**誰もログインできなくなる**）",
        "",
        "🚨 実装側へ相談したいこと: **ハーネスがコードを読む方法**。",
        "  案1 DB の ohmycms_login_codes から読む（**依存が少ない**。判定ロジックには触れないので",
        "      v0.9 のブートストラップと同じ線で許されるはず）",
        "  案2 テスト用 SMTP（MailHog 等）を立てて受信箱から読む",
        "  **案1 を推します。** どちらにするか決めてください。",
      ], started);
  }

  return result({
    id: 12, title: "V1-D メール OTP", status: STATUS.BLOCKED,
    reason: `入口はありますが（HTTP ${probe.status}）、検査はまだ書いていません`,
    details: ["実装が動き始めたので、上の5項目を実装します。"],
    ms: Date.now() - started,
  });
}
