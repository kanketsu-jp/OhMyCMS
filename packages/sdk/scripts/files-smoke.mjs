/**
 * files / folders / assets を SDK 経由で実際に叩く（README §8 の unverified を消すため）。
 *
 *   bun --filter @ohmycms/sdk build
 *   OHMYCMS_URL=http://localhost:3103 node scripts/files-smoke.mjs
 *
 * 肯定形（上げられる・取れる）と否定形（権限が無いと拒否される・SVG は attachment）を
 * 必ずセットで出す。dev-login を使うので ALLOW_DEV_LOGIN=true が要る。
 *
 * 🚨 files の権限は `directus_files` / `directus_folders` を**コレクション名として**設定する
 *   （2026-08-13 の F2-0 で認可が入った）。エージェントトークンの capabilities にも同じ名前を書く。
 */
import { createClient, isOhMyCmsError } from "../dist/index.js";

const baseUrl = process.env.OHMYCMS_URL ?? "http://localhost:3102";
const stamp = Date.now();

let failures = 0;
const pass = (label, detail) => console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ""}`);
const fail = (label, detail) => {
  failures += 1;
  console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
};

async function expectError(label, expectedStatus, fn) {
  try {
    await fn();
    fail(label, `拒否されなかった（${expectedStatus} を期待）`);
  } catch (error) {
    if (!isOhMyCmsError(error)) return fail(label, `OhMyCmsError でない: ${String(error)}`);
    if (error.status !== expectedStatus) {
      return fail(label, `status=${error.status}（${expectedStatus} を期待） code=${error.code}`);
    }
    pass(label, `status=${error.status} code=${error.code}「${error.message}」`);
  }
}

/**
 * 32x32 の PNG。
 * 🚨 **1x1 の PNG を使ってはいけない。** サーバ側の変換（sharp/libvips）が
 *   「vipspng: libpng read error」で 500 を返す（2026-08-13 実測。ホストの sharp では読める）。
 *   極小画像で落ちるのはサーバ側の問題として司令塔へ報告済みだが、
 *   ここは files/assets の疎通を見る場所なので、現実的なサイズの画像を使う。
 */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAOklEQVRIie3WSwkAMBAD0coZ/3oipioKPTzYe2DJZ87q6R0CeVFcNEFLVUybZnBmMkMVAa+gY1/T9QWGobA90ojjQAAAAABJRU5ErkJggg==",
  "base64",
);
/** script を仕込んだ SVG。ブラウザで描画されると実行されうる */
const SVG = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">` +
    `<script>window.__pwned=1</script><rect width="10" height="10" fill="red"/></svg>`,
  "utf8",
);

async function main() {
  console.log(`接続先: ${baseUrl}\n`);
  const anon = createClient({ baseUrl });

  console.log("【0】準備（管理者セッション）");
  const login = await anon.auth.devLogin(`files-smoke-${stamp}@example.test`, { admin: true });
  if (!login.sessionToken) throw new Error("dev-login が使えません（ALLOW_DEV_LOGIN を確認）");
  const cms = createClient({ baseUrl, sessionToken: login.sessionToken });
  pass("管理者セッション取得");

  console.log("\n【1】肯定形 — フォルダとファイルを作れる");
  const folder = await cms.folders.create({ name: `files-smoke-${stamp}` });
  pass("folders.create", `id=${folder.id} name=${folder.name}`);

  const png = await cms.files.upload({
    body: PNG,
    filename: `files-smoke-${stamp}.png`,
    contentType: "image/png",
    title: "疎通確認の画像",
    folder: folder.id,
  });
  pass("files.upload (PNG)", `id=${png.id} type=${png.type} size=${png.filesize}`);

  const fetched = await cms.files.get(png.id);
  pass("files.get", `filename_download=${fetched.filename_download}`);

  const listed = await cms.files.list({ limit: 50 });
  pass("files.list", `${listed.length} 件 / 今の1件を含む=${listed.some((f) => f.id === png.id)}`);

  const renamed = await cms.files.update(png.id, { title: "名前を変えた" });
  pass("files.update", `title=${renamed.title}`);

  console.log("\n【2】肯定形 — assets が実体を返す");
  const asset = await cms.files.asset(png.id);
  const isPng = asset.body[0] === 0x89 && asset.body[1] === 0x50;
  if (isPng) pass("files.asset (PNG)", `${asset.contentLength} バイト / ${asset.contentType}`);
  else fail("files.asset (PNG)", "PNG のシグネチャではない");
  console.log(`       Content-Disposition: ${asset.contentDisposition ?? "(未指定)"}`);

  const resized = await cms.files.asset(png.id, { width: 5, height: 5, format: "webp" });
  pass("files.asset の変換 (width/height/format)", `${resized.contentType} / ${resized.contentLength} バイト`);

  console.log("\n【3】否定形 — SVG は描画させない（受入基準9 を SDK 経由で見る）");
  const svg = await cms.files.upload({
    body: SVG,
    filename: `files-smoke-${stamp}.svg`,
    contentType: "image/svg+xml",
  });
  pass("files.upload (SVG)", `id=${svg.id} type=${svg.type}`);

  const svgAsset = await cms.files.asset(svg.id);
  const disposition = svgAsset.contentDisposition ?? "";
  if (disposition.toLowerCase().includes("attachment")) {
    pass("SVG は attachment で返る（inline で描画されない）", disposition);
  } else {
    fail("SVG が attachment で返らない", `Content-Disposition: ${disposition || "(未指定)"}`);
  }
  // 中身は残っている（＝「消したから安全」ではないことを示す）
  const svgText = Buffer.from(svgAsset.body).toString("utf8");
  if (svgText.includes("<script>")) {
    pass("SVG の中身はそのまま返る", "だから attachment が効いている必要がある");
  } else {
    pass("SVG の中身が書き換えられている", "サニタイズされている");
  }

  console.log("\n【4】否定形 — 権限の無いトークンでは触れない");
  // capabilities に directus_files を書かない = files への権限が無いトークン
  const limited = await cms.agents.create({
    name: `files-smoke-limited-${stamp}`,
    expires_in_days: 1,
    capabilities: { collections: { no_such_collection: ["read"] } },
  });
  const limitedClient = createClient({ baseUrl, token: limited.token });
  await expectError("一般トークンで files.list", 403, () => limitedClient.files.list());
  await expectError("一般トークンで files.get", 403, () => limitedClient.files.get(png.id));
  await expectError("一般トークンで assets", 403, () => limitedClient.files.asset(png.id));
  await expectError("一般トークンで folders.list", 403, () => limitedClient.folders.list());
  await expectError("存在しないファイル", 404, () =>
    cms.files.get("00000000-0000-0000-0000-000000000000"),
  );

  console.log("\n【5】後片付け");
  await cms.files.delete(png.id);
  await cms.files.delete(svg.id);
  await cms.folders.delete(folder.id);
  await cms.agents.delete(limited.agent.id);
  pass("files.delete x2 / folders.delete / agents.delete");
  await expectError("消したファイルは 404", 404, () => cms.files.get(png.id));

  console.log(`\n${failures === 0 ? "全項目 PASS" : `${failures} 件 FAIL`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  if (isOhMyCmsError(error)) {
    console.error(`\n想定外の OhMyCmsError: status=${error.status} code=${error.code} ${error.message}`);
    console.error(`  ${error.detail.method} ${error.detail.url}`);
  } else {
    console.error("\n想定外のエラー:", error);
  }
  process.exit(1);
});
