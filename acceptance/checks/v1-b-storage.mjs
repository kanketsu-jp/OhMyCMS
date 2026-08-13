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

  // ── どのドライバで動いているかを対象に聞く（推測しない）──
  // 🚨 これが分からないと、**ローカル FS で通っただけ**なのに「S3 が動いた」と読める。
  //   空の PASS を出さないため、答えが無いうちは BLOCKED にする。
  const health = await admin.get("/api/health");
  const driver = health.json?.storage?.driver ?? null;
  details.push(`health: ${health.text.slice(0, 160)}`);
  if (driver !== "s3") {
    return result({
      id: 10,
      title: "V1-B ストレージ（S3 互換）",
      status: STATUS.BLOCKED,
      reason: driver
        ? `対象のストレージが s3 ではありません（driver=${driver}）`
        : "対象がどのストレージで動いているか答えません",
      details: [
        ...details,
        "🚨 **storage(w4A:pD) へのお願い**: `/api/health` に",
        '   `"storage": { "driver": "s3" | "local", "bucket": "..." }` を出してください。',
        "   これが無いと、**ローカル FS で通っただけ**なのに「S3 が動いた」と読めてしまい、",
        "   受入が空の PASS になります（判定できないものは PASS にしない方針）。",
        "   秘密（アクセスキー）は出さないでください。driver と bucket 名だけで足ります。",
        "",
        "ドライバが s3 になったら、下の検査が自動で走ります:",
        "  🟢 PNG を上げて取り出せる（対照）",
        "  🔴 SVG が attachment で返る（S3 経由でも）",
        "  🔴 期限切れの署名付き URL が 403",
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
