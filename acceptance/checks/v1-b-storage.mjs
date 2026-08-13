/**
 * V1-B: **ストレージ（S3 互換）**  担当 storage(w4A:pD)
 *
 * 🚨 **実装より先に基準を書いている。** 実装が終わってから基準を作ると
 *   「測れないもの」が出るため（v0.9 の基準8 が本番で測れないと誤解した経緯）。
 *   **実装側は、ここに書いてある形で測られる**と思って作ってよい。
 *
 * 測るもの（肯定形と否定形を必ずセットで）:
 *   🟢 S3 互換（MinIO）へアップロードして**取り出せる**
 *   🔴 🚨 **SVG / HTML が `Content-Disposition: attachment` で返る**
 *      ← AGENTS.md §3.4。**S3 経由でも守れているか**が要点。
 *        ローカル FS のときは v0.9 の基準9 で守れているが、**配信経路が変わると別の話**
 *   🔴 **設定が空のときローカルへ落ちる**（壊れない）
 *   🔴 **署名付き URL を使うなら、期限切れで 403 になる**
 *
 * 🚨 対照実験を必ず置く: 「SVG が描画されない」は**アップロードに失敗していても成立する**。
 *   先に **PNG が取り出せる**ことを確かめてから、SVG の否定形を見る。
 */

import { bootstrapAvailable, lit, queryScalar } from "../lib/bootstrap.mjs";
import { establishSession } from "../lib/session.mjs";
import { assertion, result, statusFromAssertions, STATUS } from "../lib/result.mjs";

const PREFIX = "accv1b-";
/** 32x32 の PNG。🚨 1x1 は sharp が 500 を返すので使わない（v0.9 で踏んだ） */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAOklEQVR4nO3OMQEAAAgDoC1p+hdWwR5I" +
    "QM7cmZlbrQvYYgNbbGCLDWyxgS02sMUGttjAFhvYYgNbbPABBGYBAdXKzQoAAAAASUVORK5CYII=",
  "base64",
);
const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">' +
    "<script>window.__pwned=1</script><rect width=\"10\" height=\"10\" fill=\"red\"/></svg>",
  "utf8",
);

export async function check(context) {
  const started = Date.now();
  const { baseUrl } = context;
  const assertions = [];
  const details = [];
  const uploaded = [];

  const auth = await establishSession(baseUrl, { label: `${PREFIX}admin`, admin: true });
  if (!auth.ok) {
    return result({
      id: 10,
      title: "V1-B ストレージ（S3 互換）",
      status: STATUS.BLOCKED,
      reason: auth.reason,
      details: ["ファイルの検証にログイン済みセッションが要ります。", ...auth.detail],
      ms: Date.now() - started,
    });
  }
  const admin = auth.session;

  // ── 🚨 「S3 で動いた」ことをどう証明するか ──
  //   当初 `/api/health` にドライバ名を出してもらうつもりだったが、**storage の指摘の方が強い**:
  //   `directus_files.storage` 列を見れば、**その1件がどこへ行ったか**が分かる。
  //   health は「設定はこうなっている」しか言わないので、**設定はS3なのに実際は
  //   ローカルへフォールバックしていた**場合を見逃す。判定材料は DB から取る
  //   （判定の対象を DB で作るのではない。lib/bootstrap.mjs の線引きに従う）。
  const dbReady = await bootstrapAvailable();
  if (!dbReady.ok) {
    return result({
      id: 10, title: "V1-B ストレージ（S3 互換）", status: STATUS.BLOCKED,
      reason: "ファイルがどこへ行ったかを確かめられません（DB へ psql で入れない）",
      details: [
        ...details, ...(dbReady.detail ?? []),
        "🚨 HTTP の応答だけでは、**ローカルへフォールバックしたのに 200 が返っている**場合と",
        "   区別がつきません。それを PASS にすると空の合格になります。",
      ],
      ms: Date.now() - started,
    });
  }

  try {
    // ── 🚨 対照: まず PNG が往復できることを確かめる ──
    //   これが通らないうちに SVG の否定形を見ても意味が無い（上げられていないだけかもしれない）
    const form = new FormData();
    form.append("file", new Blob([PNG], { type: "image/png" }), `${PREFIX}control.png`);
    const png = await admin.request("/api/files", { method: "POST", body: form });
    const pngId = png.json?.data?.id ?? null;
    if (pngId) uploaded.push(pngId);
    assertions.push(
      assertion("positive", "対照: PNG をアップロードできる", png.status === 201,
        `HTTP ${png.status}`, "201"),
    );

    // 🚨 **中身のバイト列で判定しない。**
    //   lib/http.mjs は本文を `response.text()` で読むので、バイナリは UTF-8 として
    //   壊れる（`\x89` が U+FFFD になる）。最初これで判定しようとして FAIL を出し、
    //   **製品ではなく検出方法の誤り**だった（2026-08-13）。
    //   → Content-Type と本文の有無で見る。バイト列が要るなら fetch を直接使うこと。
    const pngAsset = pngId ? await admin.get(`/api/assets/${pngId}`) : null;
    const pngType = pngAsset?.headers?.get("content-type") ?? "";
    const gotPng = pngAsset?.status === 200 && pngType.includes("image/png");
    assertions.push(
      assertion("positive", "対照: PNG を取り出せる（image/png が返る）", gotPng,
        `HTTP ${pngAsset?.status ?? "-"} / ${pngType || "(型なし)"}`, "200 かつ image/png"),
    );

    // ── 🚨 本当に S3 へ行ったのか（フォールバックしていないか）──
    //   これが無いと、S3 が死んでいてローカルへ落ちても 200 が返って PASS になる。
    const where = pngId
      ? await queryScalar(`select storage from directus_files where id = ${lit(pngId)};`)
      : null;
    if (where !== "s3") {
      details.push(
        `🚨 このファイルは **${where ?? "不明"}** へ保存されています（s3 ではありません）。`,
        "   S3 の設定が入っていないか、**ローカルへフォールバックしています**。",
        "   ローカルでの往復は v0.9 の基準9 で既に見ているので、ここでは合格にしません。",
        "   MinIO を混ぜて起動する: docker compose -f compose.yml -f compose.minio.yml up -d",
      );
      return result({
        id: 10, title: "V1-B ストレージ（S3 互換）", status: STATUS.BLOCKED,
        reason: `ファイルの保存先が s3 ではありません（storage=${where ?? "不明"}）`,
        details, ms: Date.now() - started,
      });
    }
    assertions.push(
      assertion("positive", "S3 へ保存されている（ローカルへ落ちていない）",
        true, "directus_files.storage = s3", "s3"),
    );

    // ── 否定形: SVG は attachment で返る（S3 経由でも） ──
    const svgForm = new FormData();
    svgForm.append("file", new Blob([SVG], { type: "image/svg+xml" }), `${PREFIX}x.svg`);
    const svg = await admin.request("/api/files", { method: "POST", body: svgForm });
    const svgId = svg.json?.data?.id ?? null;
    if (svgId) uploaded.push(svgId);
    const svgAsset = svgId ? await admin.get(`/api/assets/${svgId}`) : null;
    const disposition = svgAsset?.headers?.get("content-disposition") ?? "";
    assertions.push(
      assertion("negative", "SVG が attachment で返る（S3 経由でも）",
        disposition.toLowerCase().includes("attachment"),
        disposition || "(未指定)", "attachment"),
    );

    assertions.push(
      assertion("negative", "SVG にも nosniff が付く",
        (svgAsset?.headers?.get("x-content-type-options") ?? "").includes("nosniff"),
        svgAsset?.headers?.get("x-content-type-options") ?? "(未指定)", "nosniff"),
    );

    // ── 🚨 否定形: **MIME を偽った HTML** も attachment になる ──
    //   storage の指摘（2026-08-13）: 実装は拡張子側でも塞いでいる。**ここが退行しやすい**。
    //   申告された Content-Type だけを見る作りに戻ると、これだけが通らなくなる。
    const evilForm = new FormData();
    evilForm.append(
      "file",
      new Blob(["<html><script>window.__pwned=1</script></html>"], { type: "text/plain" }),
      `${PREFIX}evil.html`,
    );
    const evil = await admin.request("/api/files", { method: "POST", body: evilForm });
    const evilId = evil.json?.data?.id ?? null;
    if (evilId) uploaded.push(evilId);
    const evilAsset = evilId ? await admin.get(`/api/assets/${evilId}`) : null;
    const evilDisposition = evilAsset?.headers?.get("content-disposition") ?? "";
    assertions.push(
      assertion("negative", "中身が HTML なら、型を text/plain と偽っても attachment",
        evilDisposition.toLowerCase().includes("attachment"),
        evilDisposition || "(未指定)", "attachment"),
    );

    // ── 否定形: 署名付き URL を使うなら、期限切れで弾かれる ──
    //   🚨 実装が署名付き URL を出さないなら、この検査は「該当なし」として details に書く
    const signed = svgId ? await admin.get(`/api/assets/${svgId}?expires=1`) : null;
    if (signed && signed.status !== 200) {
      assertions.push(
        assertion("negative", "期限切れ・不正な署名付き URL は弾かれる",
          signed.status === 403 || signed.status === 401,
          `HTTP ${signed.status}`, "403 か 401"),
      );
    } else {
      details.push(
        "署名付き URL は未実装か、期限の指定が効いていない（`?expires=1` が 200）。" +
          "🚨 実装するなら**期限切れで 403** を測る。",
      );
    }

    details.push(
      "🚨 **ローカル FS へのフォールバック**（設定が空のとき壊れない）は、" +
        "対象の環境変数を変えて起動し直す必要があるため、この検査には入れていない。" +
        "**F9 の総合受入で、compose の S3 設定を空にした対象に対して測ること。**",
    );
  } finally {
    for (const id of uploaded) {
      await admin.request(`/api/files/${id}`, { method: "DELETE" }).catch(() => {});
    }
  }

  const verdict = statusFromAssertions(assertions);
  return result({
    id: 10,
    title: "V1-B ストレージ（S3 互換）",
    status: verdict.status,
    positive: "PNG を上げて取り出せる",
    negative: "SVG は attachment",
    details: [...details, ...verdict.details],
    repro: [`bun run acceptance --v1 --only 10 --base-url ${baseUrl}`],
    assertions,
    ms: Date.now() - started,
  });
}
