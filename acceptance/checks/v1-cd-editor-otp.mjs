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
 *
 * 🚨 **私の最初の案は原理的に不可能だった**（auth の指摘・2026-08-13）:
 *   「DB の `ohmycms_login_codes` からコードを読む」→ **入っているのは scrypt のハッシュだけ**。
 *   6桁は 10^6 通りしかないので、平文や SHA-256 で持つと漏れた瞬間に総当たりされる。
 *   scrypt（実測 106ms）なら 10^6 × 0.106 秒 ≒ 29 時間かかり、寿命 10 分を超える。
 *   **ハッシュから 6 桁は戻せない**（戻せたら設計が失敗している）。
 *   → 手段を **肯定形と否定形で分ける**（auth の提案。こちらが正しい）:
 *
 *   🟢「コードを受け取って入れると入れる」→ **受信箱から読む**（MailHog 等）
 *      **発行 → 送信 → 照合**の全体が検証対象なので、受信箱を見るのが唯一の本物の確認。
 *      「検証対象は API 経由で」という線引きにも合う（**送信は検証対象そのもの**）。
 *   🔴 期限切れ / 使用済み / 他人のコード → **既知のコードをハッシュ化して行を植える**
 *      送信を必要としない。照合ロジック（期限・試行回数・使い捨て・ハッシュ比較）は
 *      **全部通る**ので迂回にならない。ブートストラップと同じ線。
 *
 *   🚨 MailHog を立てるのが重いうちは **🟢 を SKIP にして 🔴 だけ先に入れる**。
 *      「送信経路は未検証」と記録に残る方が、偽の緑より価値がある。
 *
 * 🚨 **仕様（auth より）**: `POST /api/auth/otp/request` は **常に 200 を返す**。
 *   送信に失敗しても 500 にしない。500 が返ると「そのアドレスは存在する」という
 *   **列挙の手がかり**になるため。応答時間でも分からないよう、送信を待たずに応答する。
 *   → **ハーネスは「request は常に 200」を前提にする。**
 *     送れたかどうかは**受信箱を見る以外に判定できない**（それが正しい状態）。
 *
 * 🚨 **第1段には「有効化」という操作が無い**（auth より）。
 *   いまは SMTP の設定が揃っているときだけログイン画面に OTP が出る、それだけ。
 *   「メールが送れないと有効化できない」は**第2段（GUI での有効化）の基準**なので、
 *   ここでは測らない。**いま測ると必ず落ちる。**
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
        "",
        "🚨 コードの読み方は auth の提案どおり**手段を分けます**（私の当初案は不可能でした。",
        "   DB に入っているのは scrypt のハッシュで、6桁は戻せません）:",
        "  🟢 は **受信箱から読む**（MailHog 等）。発行→送信→照合の全体が検証対象なので。",
        "  🔴 は **既知のコードをハッシュ化して行を植える**。照合ロジックは全部通ります。",
        "  MailHog が重いうちは 🟢 を SKIP にして 🔴 だけ先に入れます。",
        "  「送信経路は未検証」と残る方が、偽の緑より価値があります。",
        "",
        "🚨 「メールが送れないと有効化できない」は**第2段（GUI での有効化）**の基準なので",
        "   ここでは測りません（第1段に「有効化」という操作がないため。auth の指摘）。",
      ], started);
  }

  return result({
    id: 12, title: "V1-D メール OTP", status: STATUS.BLOCKED,
    reason: `入口はありますが（HTTP ${probe.status}）、検査はまだ書いていません`,
    details: ["実装が動き始めたので、上の5項目を実装します。"],
    ms: Date.now() - started,
  });
}
