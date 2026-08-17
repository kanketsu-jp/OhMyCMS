/**
 * 受入基準9: SVG/HTML をアップして配信しても script が実行されない。
 *          （Content-Disposition: attachment が強制される / AGENTS.md §3.4）
 *
 * `.temp/2026-08-13/f0c/f0c-test9.sh` を読んで、ハーネス用に再実装したもの。
 *
 * 🚨 否定形が自明に成立しないようにする:
 *   「SVG が inline で配信されない」は、**配信が 404 なら常に真**。
 *   なので先に「普通の PNG は 200 で inline に見える」ことを確かめてから、
 *   「SVG/HTML は 200 で届くが attachment になっている」ことを見る。
 *   つまり **本体はちゃんと届いている（200 かつ中身がある）** が前提。
 */

import { PREFIX, purgeUploadedFiles } from "../lib/fixture.mjs";
import { Session } from "../lib/http.mjs";
import { establishSession } from "../lib/session.mjs";
import { assertion, result, statusFromAssertions } from "../lib/result.mjs";


const XSS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">
  <rect width="120" height="120" fill="#eee"/>
  <script type="text/javascript">window.__ACC_SVG_EXECUTED__ = true;</script>
</svg>`;

const XSS_HTML = `<!doctype html><html><body><h1>acc</h1>
<script>window.__ACC_HTML_EXECUTED__ = true;</script></body></html>`;

/** 依存を足さずに最小の本物の PNG を作る（1x1 の赤）。 */
function tinyPng() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
}

function isAttachment(headers) {
  const disposition = headers.get("content-disposition") ?? "";
  return /(^|;|\s)attachment\b/i.test(disposition);
}

function isInline(headers) {
  const disposition = headers.get("content-disposition") ?? "";
  // 未指定はブラウザが inline 扱いするので、「attachment でない」= inline とみなす。
  return !/(^|;|\s)attachment\b/i.test(disposition);
}

async function upload(session, { name, type, body }) {
  const form = new FormData();
  form.append("file", new Blob([body], { type }), name);
  const response = await session.request("/api/files", { method: "POST", body: form });
  return { status: response.status, id: response.json?.data?.id ?? null, json: response.json };
}

export async function check(context) {
  const started = Date.now();
  const { baseUrl } = context;
  const assertions = [];
  const details = [];
  const uploaded = [];

  // 開発ビルドなら dev-login、本番ビルドなら .env の管理者でパスワードログイン
  const auth = await establishSession(baseUrl, { label: `${PREFIX}admin`, admin: true });
  if (!auth.ok) {
    return result({
      id: 9,
      title: "SVG/HTML が attachment で配信される",
      status: "BLOCKED",
      reason: auth.reason,
      details: ["ファイルのアップロードにログイン済みセッションが要ります。", ...auth.detail],
      repro: [`bun run acceptance --only 9 --base-url ${baseUrl}`],
      ms: Date.now() - started,
    });
  }
  const admin = auth.session;

  try {
    const png = await upload(admin, {
      name: `${PREFIX}ok.png`,
      type: "image/png",
      body: tinyPng(),
    });
    const svg = await upload(admin, {
      name: `${PREFIX}xss.svg`,
      type: "image/svg+xml",
      body: XSS_SVG,
    });
    const html = await upload(admin, {
      name: `${PREFIX}xss.html`,
      type: "text/html",
      body: XSS_HTML,
    });
    // 拡張子を偽装した SVG（.png と名乗る）。中身で判断しているかを見る。
    const disguised = await upload(admin, {
      name: `${PREFIX}disguised.png`,
      type: "image/png",
      body: XSS_SVG,
    });

    for (const f of [png, svg, html, disguised]) if (f.id) uploaded.push(f.id);

    if (!png.id || !svg.id || !html.id) {
      return result({
        id: 9,
        title: "SVG/HTML が attachment で配信される",
        status: "BLOCKED",
        reason: "検証用ファイルをアップロードできませんでした",
        details: [
          `png=${png.status} svg=${svg.status} html=${html.status}`,
          "ストレージ設定（R2 未設定時のローカルフォールバック）を確認してください。",
        ],
        ms: Date.now() - started,
      });
    }

    // 【肯定形①】普通の PNG は 200 で届き、inline で見える
    //   これが無いと「SVG が inline でない」は 404 でも成立してしまう。
    const pngResponse = await admin.get(`/api/assets/${png.id}`);
    assertions.push(
      assertion("positive", "PNG が 200 で配信される", pngResponse.status === 200, pngResponse.status, "200"),
    );
    assertions.push(
      assertion("positive", "PNG は attachment 強制されず画像として表示できる",
        isInline(pngResponse.headers),
        pngResponse.headers.get("content-disposition") ?? "(未指定)", "attachment ではない"),
    );

    // 【肯定形②】SVG も HTML も **本体はちゃんと届いている**（配信自体は生きている）
    const svgResponse = await admin.get(`/api/assets/${svg.id}`);
    const htmlResponse = await admin.get(`/api/assets/${html.id}`);
    assertions.push(
      assertion("positive", "SVG が 200 で配信される（配信自体は生きている）",
        svgResponse.status === 200, svgResponse.status, "200"),
    );
    assertions.push(
      assertion("positive", "SVG の本体が届いている", svgResponse.text.includes("<svg"),
        `${svgResponse.text.length} bytes`, "<svg を含む"),
    );
    assertions.push(
      assertion("positive", "HTML が 200 で配信される", htmlResponse.status === 200,
        htmlResponse.status, "200"),
    );

    // 【否定形①】SVG は attachment
    assertions.push(
      assertion("negative", "SVG が inline で描画されない（attachment 強制）",
        isAttachment(svgResponse.headers),
        svgResponse.headers.get("content-disposition") ?? "(未指定)", "attachment"),
    );
    // 【否定形②】HTML は attachment
    assertions.push(
      assertion("negative", "HTML が inline で描画されない（attachment 強制）",
        isAttachment(htmlResponse.headers),
        htmlResponse.headers.get("content-disposition") ?? "(未指定)", "attachment"),
    );

    // 【否定形③】変換パラメータを付けても attachment が外れない（迂回経路）
    for (const [label, query] of [
      ["?format=png", "?format=png"],
      ["?width=100", "?width=100"],
    ]) {
      const bypass = await admin.get(`/api/assets/${svg.id}${query}`);
      assertions.push(
        assertion("negative", `SVG に ${label} を付けても attachment が外れない`,
          bypass.status !== 200 || isAttachment(bypass.headers),
          `HTTP ${bypass.status} / ${bypass.headers.get("content-disposition") ?? "(未指定)"}`,
          "attachment か非 200"),
      );
    }

    // 【否定形④】偽装してアップロードしても、**ブラウザが script を実行する型では配信されない**
    //
    // ここは「attachment が付くか」ではなく **受入基準の文言そのもの**（script が実行されない）で
    // 判定する。実装は lib/files/service.ts の safeDeliveryHeaders が
    // DANGEROUS_INLINE_MIME = {text/html, image/svg+xml} を octet-stream + attachment に落とす作り。
    // 偽装して image/png として保存された SVG は image/png のまま配信されるが、
    // ブラウザは画像ドキュメントとして扱うので script は動かない（Chrome で実測済み。§下の note）。
    // したがって「危険な型で配信されていないこと」を不変条件にする。
    if (disguised.id) {
      const disguisedResponse = await admin.get(`/api/assets/${disguised.id}`);
      const servedType = (disguisedResponse.headers.get("content-type") ?? "").split(";")[0].trim();
      const executable = servedType === "text/html" || servedType === "image/svg+xml";
      assertions.push(
        assertion("negative", "偽装アップロードが script 実行可能な型で配信されない",
          !executable || isAttachment(disguisedResponse.headers),
          `${servedType || "(未指定)"}`,
          "text/html でも image/svg+xml でもない（または attachment）"),
      );

      // 🚨 **ここは以前「nosniff が無ければ note を出す」だった。いまその条件は成立しない。**
      //   `next.config.ts` の `headers()` が nosniff を入れるようになったので、
      //   **この if は二度と真にならない**（＝ **出ない note を、出る顔で置いていた**）。
      //   🟢 実測（2026-08-17・design・:3102。**叩いた応答は全部 nosniff 1 行**）:
      //     200（`/api/health` / `/admin/files`）／ 404 / 401（`/api/assets/…`）／ 405（saml の ACS）
      //     🟢 対照 :3199（居ないホスト）… **0**
      //   🚨 **「だから全経路」とは書かない**——**設定も、測った数件も、全体の保証ではない**。
      //     **実体を伴う 200 は測れていない**（s3 の実体が残っていない。詳細は v1-b-storage.mjs 側）。
      //   → **note（落ちない・条件付き）から assertion（落ちる・常に評価）へ上げる。**
      //     「推奨します」と書いて放置するのではなく、**約束として測る**。
      //
      // 🚨 **この assertion が見ていない範囲**（`decisions/checks-must-declare-blind-spots`）:
      //   **応答に nosniff が在るか**しか見ない。**誰が供給したかは見ていない**。
      //   ①自前（`app/api/assets/[id]/route.ts:31`）と ②既定（`next.config.ts`）の 2 層が在り、
      //   🚨 **①が消えても②が同じ値を入れるので緑のまま**。**自前の消失は検出できない。**
      //   ＝ ここが守るのは「**利用者に届く応答に nosniff が在る**」までで、
      //     「**多層防御が 2 層のまま保たれている**」ではない（同じ盲点が `v1-b-storage.mjs` にも在る）。
      assertions.push(
        assertion("negative", "MIME を偽った SVG の配信にも nosniff が付く（🚨 供給元は問わない）",
          (disguisedResponse.headers.get("x-content-type-options") ?? "").includes("nosniff"),
          disguisedResponse.headers.get("x-content-type-options") ?? "(未指定)", "nosniff"),
      );
      // 🚨 消した note の中身は、いま assertion が測っている:
      //   「保存される MIME はクライアント申告と拡張子から決まるので、SVG の中身を image/png と
      //     偽って保存させられる。nosniff がその抜け道を塞ぐ」
      //     （Chrome では画像ドキュメント扱いになり script は実行されないことを、当時実測済み）
    }

    // 【肯定形⑤】新規アップロードしたアセットは認証なしで取れる
    const anon = new Session(baseUrl, "anon");
    const anonAsset = await anon.get(`/api/assets/${svg.id}`);
    assertions.push(
      assertion("positive", "新規アップロードしたアセットを認証なしで取れる",
        anonAsset.status === 200,
        anonAsset.status, 200),
    );

    const verdict = statusFromAssertions(assertions);
    return result({
      id: 9,
      title: "SVG/HTML が attachment で配信される",
      status: verdict.status,
      positive: `PNG ${pngResponse.status} inline`,
      negative: isAttachment(svgResponse.headers) ? "SVG attachment" : "SVG inline",
      details: [...details, ...verdict.details],
      repro:
        verdict.status === "PASS"
          ? []
          : [`curl -sS -D - -o /dev/null '${baseUrl}/api/assets/<svgのid>' | grep -i content-disposition`],
      assertions,
      ms: Date.now() - started,
    });
  } finally {
    // 🚨 理由は `lib/fixture.mjs` の `purgeUploadedFiles` の冒頭。
    //   論理削除で止めると、走行のたびにゴミ箱へ積み上がる（2026-08-17 実測）。
    const cleanup = await purgeUploadedFiles(admin, uploaded);
    details.push(
      `片付け: 上げた ${cleanup.tried} 件 / ゴミ箱へ ${cleanup.softDeleted} 件 / ` +
        `完全削除 ${cleanup.purged} 件 / 🚨 残り ${cleanup.remaining} 件`,
    );
    for (const note of cleanup.notes) details.push(`  片付けの失敗: ${note}`);
    // 🚨 **見ていない範囲**: この行は **PASS のときは画面に出ない**
    //   （`lib/report.mjs:92-104` は FAIL/BLOCKED でしか details を出さない）。
    //   `v1-b-storage.mjs` は assertion に上げてあるが、**ここは上げられない**——
    //   このファイルは `statusFromAssertions` を **`finally` より前（226 行）**で呼ぶので、
    //   ここで push しても**数に入らない**。**入らない assertion は、在るのに効かない**ので置かない。
    //   ＝ **片付けが壊れても、この検査は緑のまま**。確かめるなら DB を見ること:
    //     select count(*) from directus_files where deleted_at is not null;
  }
}

export const meta = { id: 9, needsServer: true };
