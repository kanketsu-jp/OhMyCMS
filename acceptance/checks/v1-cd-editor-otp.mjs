/**
 * V1-C: **Tiptap の WYSIWYG**  担当 tiptap(w4A:pC)
 * V1-D: **メール OTP**        担当 auth(w4A:p9)
 *
 * 🚨 **実装より先に基準を書いている。実装側はこの形で測られる。**
 * 未実装なら **SKIP**（PASS にも FAIL にもしない）。何が要るかを reason に出す。
 */

import { bootstrapAvailable, bootstrapUser, cleanupBootstrap } from "../lib/bootstrap.mjs";
import { cleanupLoginCodes, plantLoginCode } from "../lib/otp.mjs";
import { establishSession } from "../lib/session.mjs";
import { assertion, result, statusFromAssertions, STATUS } from "../lib/result.mjs";

const PREFIX = "accv1_";
/** 🚨 後片付けの目印。bootstrap の接頭辞と揃える（英数と ._- のみ） */
const OTP_PREFIX = "accv1d-";

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

  // ── 実装されているかを対象に聞く ──
  // 🚨 **リッチテキストは「フィールド型」ではない**（tiptap の指摘・2026-08-13）。
  //   型は既存の `json`（jsonb）のままで、**`meta.interface === "richtext"`** で表す。
  //   実行時にスキーマが変わる CMS なので、本文のたびに SQL 型を増やすと DDL が増える。
  //   jsonb + interface なら GUI でフィールドを足すだけで済む。
  //   → 私は最初 `rich_text` / `tiptap` という**型名**を探していた。**探す場所が違った。**
  const fields = await admin.get("/api/fields");
  const hasRichText =
    fields.status === 200 && /"interface"\s*:\s*"richtext"/.test(fields.text);
  if (!hasRichText) {
    return skip(11, "V1-C Tiptap の WYSIWYG",
      "リッチテキストの interface がまだ見当たりません（meta.interface === \"richtext\"）",
      [
        "実装されたら、このチェックが自動的に本物へ切り替わります。**測る内容を先に置いておきます**:",
        "  🟢 保存して読み出すと同じ内容（**JSON/jsonb で保存**。tiptap が確定）",
        "  🔴 🚨 `<script>` を含む内容を保存 → **配信時に実行されない**",
        "     ← 対照実験つき。**危険な形が検出器に引っかかる**ことを先に確かめる",
        "  🟢 検索でヒットする（**プレーンテキストを別列に持つ**設計）",
        "🚨 実装側へ: **保存した JSON をそのまま `dangerouslySetInnerHTML` へ渡さないこと**。",
        "   v0.9 の SVG と同じ経路で XSS になります。",
      ], started);
  }

  // ── 本物の検査 ──
  // 🚨 ここは以前「対照実験」だけを置いていたが、**肯定形しか無い**ためハーネスに
  //   「両方を持っていない」と落とされた。**検査の不備**であって製品の問題ではなかった。
  //   interface が入ったので、実際に保存して読み出す形へ差し替える（2026-08-14）。
  const created = await admin.postJson("/api/collections", {
    collection,
    fields: [
      { field: "id", type: "uuid", meta: { hidden: true }, schema: { is_primary_key: true } },
      { field: "body", type: "json", meta: { interface: "richtext" } },
    ],
  });
  if (created.status !== 201 && created.status !== 200) {
    return result({
      id: 11, title: "V1-C Tiptap の WYSIWYG", status: STATUS.BLOCKED,
      reason: `検証用のコレクションを作れませんでした（HTTP ${created.status}）`,
      details: [created.text.slice(0, 200)], ms: Date.now() - started,
    });
  }

  try {
    // 🚨 スクリプトを**中身に含んだ**まま保存する。ここで消してしまうと、
    //   「配信時に安全になっているか」を確かめられない（入口で消すのは別の設計判断）。
    const payload = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "ふつうの文章" }] },
        { type: "paragraph", content: [{ type: "text", text: '<script>window.__pwned=1</script>' }] },
      ],
    };
    const saved = await admin.postJson(`/api/items/${collection}`, { body: payload });
    const id = saved.json?.data?.id ?? null;
    const read = id ? await admin.get(`/api/items/${collection}/${id}`) : null;
    const body = read?.json?.data?.body ?? null;

    // 🚨 **素の JSON.stringify で比べない。** 実測で2つ違いが出る（2026-08-14）:
    //   ① jsonb が**キーの順番を正規化する**（{"type","text"} → {"text","type"}）
    //   ② 実装が **`schemaVersion` を足す**
    //   どちらも中身は保たれているのに「違う」と出た。**製品でなく比較の仕方の誤り。**
    //   → キー順に依存しない形にし、実装が足したフィールドは差として扱わない。
    const canonical = (value) => {
      if (Array.isArray(value)) return value.map(canonical);
      if (value && typeof value === "object") {
        return Object.fromEntries(
          Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
        );
      }
      return value;
    };
    const roundTrip =
      JSON.stringify(canonical(body?.content)) === JSON.stringify(canonical(payload.content)) &&
      body?.type === payload.type;

    assertions.push(
      assertion("positive", "リッチテキストを保存して読み出すと中身が保たれる",
        roundTrip,
        roundTrip
          ? `一致（実装が足した項目: ${Object.keys(body ?? {})
              .filter((k) => !(k in payload))
              .join(", ") || "なし"}）`
          : `HTTP ${read?.status ?? "-"} / 中身が違う`,
        "保存した content と一致"),
    );

    // 🔴 否定形: **JSON として返る。HTML として返らない。**
    //   ここが text/html で返るようになると、そのままブラウザが描画してスクリプトが動く
    //   （v0.9 の SVG と同じ経路）。**配信の型を固定していることを見る。**
    const contentType = (read?.headers?.get("content-type") ?? "").split(";")[0].trim();
    assertions.push(
      assertion("negative", "リッチテキストが HTML として配信されない（JSON で返る）",
        contentType === "application/json",
        contentType || "(型なし)", "application/json"),
    );

    // ── 🔴 否定形: **保存側も知らないノードを受け付けない** ──
    // 🚨 tiptap が 11e2336 で塞いだ穴の回帰検査。**私の質問で見つかった**もの:
    //   それまで保存側にノード／装飾の許可リストが無く、`{type:"script"}` が DB に入っていた。
    //   描画側（SDK の `<RichText>`）が弾くので実害は出ないが、
    //   **「保存できるのに描かれない」ねじれ**は、あとで必ず「なぜ出ない」を生む。
    //   → **両側で弾く**（サーバは外へ出す値、SDK は描き方。片方を通らない経路が穴になる）。
    const hostile = await admin.postJson(`/api/items/${collection}`, {
      body: {
        type: "doc",
        content: [
          { type: "script", content: [{ type: "text", text: "window.__pwned=1" }] },
          { type: "paragraph", content: [{ type: "text", text: "残る文章" }] },
        ],
      },
    });
    const hostileId = hostile.json?.data?.id ?? null;
    const storedRaw = hostileId
      ? JSON.stringify((await admin.get(`/api/items/${collection}/${hostileId}`)).json?.data?.body ?? null)
      : "";
    assertions.push(
      assertion("negative", "知らないノード（script）は保存されない（文章は残る）",
        hostile.status < 400 && !storedRaw.includes("__pwned") && storedRaw.includes("残る文章"),
        hostile.status >= 400
          ? `保存が HTTP ${hostile.status} で拒否された`
          : storedRaw.includes("__pwned") ? "🚨 script が保存されている" : "script は落ち、文章は残った",
        "script は保存されず、文章は残る"),
    );

    details.push(
      "🚨 **描画時のサニタイズはここでは測れていません**（unverified）。",
      "  保存した JSON を HTML にする経路がまだ無いためです。",
      "  司令塔の整理では**サーバがサニタイズの責任を持つ**方が安全（SDK を使わない経路もあるため）。",
      "  その経路ができたら、ここに「`<script>` が実行されない形で出る」を足します。",
    );
  } finally {
    await admin.request(`/api/collections/${collection}`, { method: "DELETE" }).catch(() => {});
  }

  const verdict = statusFromAssertions(assertions);
  return result({
    id: 11, title: "V1-C Tiptap の WYSIWYG", status: verdict.status,
    positive: "保存して読み出せる", negative: "HTML では返らない",
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

  const assertions = [];
  const details = [];
  const email = `${OTP_PREFIX}user@example.com`;
  const other = `${OTP_PREFIX}other@example.com`;

  const db = await bootstrapAvailable();
  if (!db.ok) {
    return result({
      id: 12, title: "V1-D メール OTP", status: STATUS.BLOCKED,
      reason: "既知のコードを植えられません（DB へ psql で入れない）",
      details: [...(db.detail ?? []), "コードは scrypt のハッシュでしか保存されないため、読み出せません。"],
      ms: Date.now() - started,
    });
  }

  // 検証対象の利用者が要る（コードは active な利用者にしか出ない）
  const userA = await bootstrapUser(baseUrl, { email });
  const userB = await bootstrapUser(baseUrl, { email: other });
  if (!userA.ok || !userB.ok) {
    await cleanupBootstrap(OTP_PREFIX);
    return result({
      id: 12, title: "V1-D メール OTP", status: STATUS.BLOCKED,
      reason: "検証用の利用者を作れませんでした",
      details: [userA.reason ?? "", userB.reason ?? ""].filter(Boolean),
      ms: Date.now() - started,
    });
  }

  const verify = async (asEmail, code) => {
    const response = await fetch(`${baseUrl}/api/auth/otp/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: asEmail, code }),
      redirect: "manual",
    }).catch(() => null);
    return response?.status ?? 0;
  };

  try {
    await cleanupLoginCodes(OTP_PREFIX);

    // ── 🚨 対照: **正しいコードなら通る** ──
    //   これが無いと、以下の否定形は「常に 401 を返す実装」でも全部通ってしまう。
    //   ここが通ることで、**植え方（scrypt の形式）が製品と一致している**ことも同時に確かめられる。
    await plantLoginCode({ email, code: "123456" });
    const good = await verify(email, "123456");
    assertions.push(
      assertion("positive", "対照: 正しいコードで入れる", good === 200, `HTTP ${good}`, "200"),
    );

    // ── 🔴 期限切れ ──
    await plantLoginCode({ email, code: "222222", expiresInMs: -60 * 1000 });
    const expired = await verify(email, "222222");
    assertions.push(
      assertion("negative", "期限切れのコードでは入れない", expired === 401, `HTTP ${expired}`, "401"),
    );

    // ── 🔴 使用済み ──
    await plantLoginCode({ email, code: "333333", consumed: true });
    const consumed = await verify(email, "333333");
    assertions.push(
      assertion("negative", "使用済みのコードでは入れない", consumed === 401, `HTTP ${consumed}`, "401"),
    );

    // ── 🔴 他人のコード ──
    await plantLoginCode({ email: other, code: "444444" });
    const stolen = await verify(email, "444444");
    assertions.push(
      assertion("negative", "他人あてのコードでは入れない", stolen === 401, `HTTP ${stolen}`, "401"),
    );

    // ── 🔴 試行回数の上限（MAX_ATTEMPTS = 5）──
    //   🚨 **上限に達した後は「正しいコードでも入れない」**ことを見る。
    //     単に間違いが 401 になるだけなら、総当たりは止まらない。
    await plantLoginCode({ email, code: "555555", attempts: 5 });
    const overAttempts = await verify(email, "555555");
    assertions.push(
      assertion("negative", "試行回数を使い切ったら、正しいコードでも入れない",
        overAttempts === 401, `HTTP ${overAttempts}`, "401"),
    );

    // ── 仕様の確認: request は常に 200（宛先の存在を漏らさない）──
    const known = await fetch(`${baseUrl}/api/auth/otp/request`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }), redirect: "manual",
    }).catch(() => null);
    const unknown = await fetch(`${baseUrl}/api/auth/otp/request`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: `${OTP_PREFIX}nobody@example.com` }), redirect: "manual",
    }).catch(() => null);
    assertions.push(
      assertion("negative", "居る宛先と居ない宛先で応答が変わらない（列挙できない）",
        known?.status === unknown?.status,
        `居る ${known?.status ?? "-"} / 居ない ${unknown?.status ?? "-"}`, "同じ"),
    );

    details.push(
      "🚨 **メールの送信経路は未検証**（unverified）。コードは scrypt のハッシュでしか",
      "  保存されないため、**受信箱を見ない限り「届いたコードで入れる」は測れません**。",
      "  ここで測っているのは**照合ロジック**（期限・使い捨て・持ち主・試行回数）です。",
      "  🟢「コードを受け取って入れる」を測るには MailHog 等が要ります（auth と合意済み）。",
      "  **「送信経路は未検証」と残る方が、偽の緑より価値がある**と判断しました。",
    );
  } finally {
    await cleanupLoginCodes(OTP_PREFIX);
    await cleanupBootstrap(OTP_PREFIX);
  }

  const verdict = statusFromAssertions(assertions);
  return result({
    id: 12, title: "V1-D メール OTP", status: verdict.status,
    positive: "正しいコードで入れる", negative: "期限切れ・使用済み・他人・試行超過",
    details: [...details, ...verdict.details], assertions, ms: Date.now() - started,
  });
}
