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

import { deflateSync } from "node:zlib";
import { crc32 } from "node:zlib";

import { bootstrapAvailable, lit, queryScalar } from "../lib/bootstrap.mjs";
import { establishSession } from "../lib/session.mjs";
import { assertion, result, statusFromAssertions, STATUS } from "../lib/result.mjs";

const PREFIX = "accv1b-";
/**
 * 32x32 の PNG（対照用）。
 *
 * 🚨 **base64 のリテラルを貼らない。** 以前ここに貼っていた 32x32 の base64 は
 *   **IDAT の CRC が合っておらず、zlib で展開できない壊れた PNG** だった（storage が発見・2026-08-14）。
 *   sharp / ffmpeg / 素の zlib の3つが揃って「壊れている」と言った。
 *   そのせいで「小さい画像にはブラーが付かない」と読み、**実装の不具合だと誤って報告した**。
 *
 * 🚨 一番まずいのは、**対照（肯定形）に壊れた画像を使っていたこと**。
 *   「壊れた画像では null」という否定形と区別がつかなくなる。
 *   「PNG を上げて取り出せる」は通っていたが、それは**バイト列を往復させていただけ**で、
 *   **画像として妥当かを一度も確かめていなかった**。
 *   → 自分で組み立てる（CRC も IDAT も正しくなる）。1x1 は sharp が 500 を返すので使わない。
 */
const PNG = makeGradientPng(32, 32);
const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">' +
    "<script>window.__pwned=1</script><rect width=\"10\" height=\"10\" fill=\"red\"/></svg>",
  "utf8",
);

/**
 * **写真に近い（滑らかな）PNG を作る。** 圧縮の検証に要る。
 *
 * 🚨 ノイズ画像を使わないこと。ノイズは WebP でも小さくならず、storage の実装は
 *   **太るなら作らない**ので「圧縮されていない」と誤って読める。**製品でなく素材の誤り**になる。
 * 依存を増やさないため、PNG を手で組み立てる（Node の zlib だけ使う）。
 */
function makeGradientPng(width, height) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0; // フィルタ種別 None
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      raw[offset] = Math.floor((x / width) * 255);
      raw[offset + 1] = Math.floor((y / height) * 255);
      raw[offset + 2] = Math.floor(((x + y) / (width + height)) * 255);
      offset += 3;
    }
  }
  const chunk = (type, body) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed) >>> 0);
    return Buffer.concat([length, typed, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // ビット深度
  ihdr[9] = 2; // トゥルーカラー
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function uploadAndMeasure(admin, body, filename, type, extraFields = {}) {
  const form = new FormData();
  form.append("file", new Blob([body], { type }), filename);
  for (const [key, value] of Object.entries(extraFields)) form.append(key, value);
  const uploaded = await admin.request("/api/files", { method: "POST", body: form });
  const id = uploaded.json?.data?.id ?? null;
  if (!id) return { id: null, status: uploaded.status, bytes: null, servedType: null };
  const served = await admin.get(`/api/assets/${id}`);
  const length = Number(served.headers?.get("content-length") ?? NaN);
  return {
    id,
    status: uploaded.status,
    bytes: Number.isFinite(length) ? length : null,
    servedType: (served.headers?.get("content-type") ?? "").split(";")[0].trim(),
  };
}

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
    // 🚨 **`image/png` で固定しない。** storage が圧縮を入れたので、`?width=` の無い配信は
    //   `<uuid>/compressed.webp` が返る（元が PNG でも **image/webp**）。
    //   ここの対照が確かめたいのは「上げたものが画像として取り出せる」ことなので、
    //   **具体的な形式に縛らない**（縛ると圧縮を入れた日に、製品でなく検査が落ちる）。
    const gotImage = pngAsset?.status === 200 && pngType.startsWith("image/");
    assertions.push(
      assertion("positive", "対照: 上げた画像を取り出せる（画像として返る）", gotImage,
        `HTTP ${pngAsset?.status ?? "-"} / ${pngType || "(型なし)"}`, "200 かつ image/*"),
    );

    // ── 🚨 アップロード自体が失敗したのか、行けたが行き先が違うのか ──
    //   ここを分けずに 1 つの BLOCKED にまとめていたせいで、**502 でアップロードできていない**のに
    //   「S3 の設定が入っていないか、ローカルへフォールバックしています」と出ていた（2026-08-17・design）。
    //   どちらも `pngId` が null → `where` が null → **storage=不明** という同じ顔になる。
    //   🚨 描画側（lib/report.mjs）は BLOCKED のとき `details` しか出さないので、
    //      上で積んだ assertion（`HTTP 502`）は読み手に一切届かない。**details に自分で書く。**
    if (!pngId) {
      const code = png.json?.error?.code ?? "(コードなし)";
      const message = png.json?.error?.message ?? "(本文なし)";
      details.push(
        `🚨 **アップロードそのものが失敗しています**（HTTP ${png.status} / 期待 201）。`,
        `   応答: ${code} — ${message}`,
        "   ＝ **S3 の設定が無いのでも、ローカルへ落ちたのでもありません**（行は 1 つも作られていない）。",
        "   🚨 この 2 つは別物です。混同すると、台（MinIO）を疑って時間を使います:",
        "     ・アップロードが失敗（いまここ）… 応答コードと、その括弧の中の名前を読む",
        "     ・行けたが行き先が local  ……… S3 の設定が無いか、フォールバックしている",
      );
      return result({
        id: 10, title: "V1-B ストレージ（S3 互換）", status: STATUS.BLOCKED,
        reason: `アップロードが HTTP ${png.status} で失敗しました（${code}）`,
        details, ms: Date.now() - started,
      });
    }

    // ── 🚨 本当に S3 へ行ったのか（フォールバックしていないか）──
    //   これが無いと、S3 が死んでいてローカルへ落ちても 200 が返って PASS になる。
    const where = await queryScalar(
      `select storage from directus_files where id = ${lit(pngId)};`,
    );
    if (where !== "s3") {
      details.push(
        `🚨 このファイルは **${where ?? "不明"}** へ保存されています（s3 ではありません）。`,
        `   （アップロード自体は成功しています: HTTP ${png.status}）`,
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

    // 🚨 **この assertion が見ていない範囲**（`decisions/checks-must-declare-blind-spots`）。
    //   見るのは **応答に nosniff が在るか**だけで、**誰が供給したかは見ていない**。
    //   nosniff は 2 箇所から入る:
    //     ① 自前 … `app/api/assets/[id]/route.ts:31`（`asset.contentTypeOptions`）
    //     ② 既定 … `next.config.ts` の `headers()`（source は `/:path*`）
    //   ＝ 🚨 **①が消えても、②が同じ値を同じ応答に入れるので、ここは緑のままになる。**
    //     **自前の消失は、この検査では検出できない。**
    //
    //   🟢 実測（2026-08-17・design・:3102。**叩いた応答は全部 nosniff 1 行**）:
    //        `/api/health` **200** ／ `/admin/files` **200**
    //        `/api/assets/<存在しない uuid>` **404** ／ 未ログインの同じ口 **401**
    //        `/api/auth/saml/acs` **405**
    //      🟢 対照 :3199（居ないホスト）… nosniff **0**（＝ この数え方は「無い」も出せる）
    //   🚨 **それでも「全経路」とは書かない**（**設定も、測った数件も、全体の保証ではない**）。
    //   🚨 **測れていないもの**: **実体を伴う 200**（＝ 保存されたファイルが実際に返る応答）。
    //     s3 の実体は残っておらず、DB に行が在る id を叩いても **404** になる（design が実測）。
    //     ＝ **「異常が無い 0」ではなく「測れていない」**。
    //
    //   🚨 **②を外して測る逃げ道は、いまのところ見つかっていない。**
    //     ＝ **①の生存を応答から見る手が無い**ので、見たいなら**コードを見る検査**が要る（ここには無い）。
    //
    //   🚨 **この段落は 3 回書き換わっている。次に触る人は、まず自分で叩いてほしい。**
    //     ① 初版 …「`/:path*` だから全経路」… **設定を結果として書いた**（design）
    //     ② 2 版 …「500 には届かない（届かない口が実在する）」
    //          … 【storage が測った】を design が引き受けたが、
    //            🚨 **storage が自分で取り消した**（**既定が入る前の版を焼いた台での測定**＝
    //            **「見ていない 0」だった**。同じ台で 200 も 0 行だったことで storage が気づいた）
    //     ③ いま …「**叩いた応答は全部 1 行。ただし全経路とは言わない。実体を伴う 200 は未測定**」
    //     ＝ 🚨 **ラベル（【誰が測った】）は責任の所在を書くだけで、測定の成立を保証しない**
    //       （saml の教訓。**載せた時点で、その計器を引き受けている**）。
    assertions.push(
      assertion("negative", "SVG にも nosniff が付く（🚨 供給元は問わない）",
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

    // ── 圧縮（storage が実装済み・2026-08-13）──
    //   🚨 `?width=` の無い配信は `<uuid>/compressed.webp` が返る。元が PNG でも image/webp。
    const source = makeGradientPng(1200, 800);
    const compressed = await uploadAndMeasure(
      admin, source, `${PREFIX}photo.png`, "image/png",
    );
    if (compressed.id) uploaded.push(compressed.id);
    const plain = await uploadAndMeasure(
      admin, source, `${PREFIX}photo-plain.png`, "image/png", { compress: "false" },
    );
    if (plain.id) uploaded.push(plain.id);

    details.push(
      `圧縮の実測: 元 ${source.length}B → 配信 ${compressed.bytes ?? "?"}B` +
        `（${compressed.servedType || "型なし"}） / compress=false は ${plain.bytes ?? "?"}B` +
        `（${plain.servedType || "型なし"}）`,
    );
    assertions.push(
      assertion("positive", "大きい画像は圧縮されて配信される（元より小さい）",
        typeof compressed.bytes === "number" && compressed.bytes < source.length,
        `${compressed.bytes ?? "?"}B < ${source.length}B`, "元より小さい"),
    );
    // 🚨 対照: **compress=false でも小さくなったら、圧縮していることの証明にならない**
    //   （単に PNG より WebP が小さいだけ、という説明が残る）。差が出ることを見る。
    assertions.push(
      assertion("negative", "compress=false なら圧縮されない（同じ画像で差が出る）",
        typeof plain.bytes === "number" &&
          typeof compressed.bytes === "number" &&
          plain.bytes > compressed.bytes,
        `compress=false ${plain.bytes ?? "?"}B > 既定 ${compressed.bytes ?? "?"}B`,
        "指定した方が大きい"),
    );

    // 🔴 壊れた画像を上げても、アップロードは成功する（飾りで本体を落とさない）
    const brokenBody = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("これは PNG のふりをした壊れたファイルです"),
    ]);
    const broken = await uploadAndMeasure(admin, brokenBody, `${PREFIX}broken.png`, "image/png");
    if (broken.id) uploaded.push(broken.id);
    assertions.push(
      assertion("negative", "壊れた画像でもアップロード自体は成功する",
        broken.status === 201, `HTTP ${broken.status}`, "201"),
    );

    // ── ブラー版 ──
    // 🚨 **32x32 の対照ではなく、圧縮に使った現実的な画像（1200x800）で測る。**
    //   最初これを対照の 32x32 で測って FAIL を出したが、**製品ではなく測る対象の誤り**だった。
    //   実測: 32x32 は blur も compressed_key も付かない / 1200x800 は両方付く（2026-08-14）。
    //   小さい画像に付かないのは意図的な閾値だと思われるが、**storage に確認中**。
    const blur = compressed.id
      ? await queryScalar(
          `select coalesce(blur_data_url, '') from directus_files where id = ${lit(compressed.id)};`,
        )
      : null;
    if (blur === null) {
      details.push(
        "ブラー版はまだ来ていません（`blur_data_url` の列が無い）。来たら測る内容:",
        "  🟢 画像なら `data:image/webp;base64,` で始まる値が返る（storage の実測 215 文字 / 142B）",
        "  🟢 1KB 未満",
        "  🔴 PDF・動画・壊れた画像では null",
        "  🔴 🚨 **SVG では null**（storage の判断。SVG のラスタライズは外部参照を辿る経路があり、",
        "     §3.4 で attachment を強制している当のファイルをサーバ側で描画することになるため）",
        "  🔴 🚨 **ブラーの生成に失敗しても、アップロード自体は成功する**（飾りで本体を落とさない）",
        "  🟢 🚨 **width/height が「向きを適用した後」の寸法**（storage が EXIF の実害を発見・修正済み。",
        "     orientation=6 で metadata() は 200x100 を返すが配信画素は 100x200。ずれると画面が飛び跳ねる）",
      );
    } else {
      assertions.push(
        assertion("positive", "画像にブラー版が付く（data:image/webp;base64, で始まる）",
          blur.startsWith("data:image/webp;base64,"),
          blur ? `${blur.slice(0, 26)}…（${blur.length} 文字）` : "(空)",
          "data:image/webp;base64,"),
      );
      assertions.push(
        assertion("positive", "ブラー版が 1KB 未満", blur.length > 0 && blur.length < 1024,
          `${blur.length} 文字`, "1024 文字未満"),
      );

      // 🚨 **小さい画像にもブラーが付く**（寸法による分岐は無い、と storage が実測で示した）。
      //   ここを測れるようになったのは、対照 PNG を壊れていないものへ差し替えたから。
      //   壊れた PNG のままだと「小さいから付かない」と「壊れているから付かない」の
      //   区別がつかない。**対照が妥当であることが、否定形の意味を決める。**
      const smallBlur = pngId
        ? await queryScalar(
            `select coalesce(blur_data_url, '') from directus_files where id = ${lit(pngId)};`,
          )
        : null;
      assertions.push(
        assertion("positive", "小さい画像（32x32）にもブラー版が付く",
          typeof smallBlur === "string" && smallBlur.startsWith("data:image/webp;base64,"),
          smallBlur ? `${smallBlur.length} 文字` : "(空)", "data:image/webp;base64,"),
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
