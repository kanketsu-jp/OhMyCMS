/**
 * 配信用の圧縮版の実測ハーネス。
 *
 *   bun --filter @ohmycms/studio verify:compress [素材ディレクトリ]
 *
 * 🚨 本番と同じ関数（lib/files/service.ts の compressImage）を呼ぶ。
 *    ここで sharp を直に組み立て直すと、**本番の設定を検証しないテスト**になる。
 *
 * 測るもの（司令塔が出した受入基準に対応）:
 *   🟢 大きい画像は**保存されるサイズが元より小さい**（何KB → 何KB の実測値で）
 *   🟢 トグルを切ると圧縮されない（＝ compress:false で圧縮版を作らない。呼び出し側の分岐）
 *   🔴 圧縮しても壊れない（**透過が残る / アニメが動く / 向きが正しい**）
 *   🔴 SVG は圧縮対象にしない（§3.4 の attachment 強制と衝突させない）
 *   🚨 生成に失敗してもアップロードを落とさない（＝ null を返して呼び出し側が続行できる）
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { compressImage, createBlurDataUrl } from "../lib/files/service";

const dir = process.argv[2] ?? "";

let failures = 0;
function check(label: string, ok: boolean, detail: string): void {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  ${detail}`);
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)}KB`;
}

/** sharp が読んだ実際の形式。本番の uploadFile も同じ判定で圧縮の可否を決める。 */
async function detectFormat(buffer: Buffer): Promise<string | null> {
  try {
    return (await sharp(buffer).metadata()).format ?? null;
  } catch {
    return null;
  }
}

async function measureRealPhotos(): Promise<void> {
  if (!dir) {
    console.log("素材ディレクトリの指定が無いので、大きい画像の実測は飛ばした（unverified）");
    return;
  }
  for (const name of ["photo.png", "photo.jpg"]) {
    const input = await readFile(path.join(dir, name)).catch(() => null);
    if (!input) {
      console.log(`   ${name} が無いので飛ばした（unverified）`);
      continue;
    }
    const format = await detectFormat(input);
    const started = performance.now();
    const result = await compressImage(input, format);
    const ms = performance.now() - started;
    check(
      `大きい画像が小さくなる（${name}）`,
      result !== null && result.buffer.byteLength < input.byteLength,
      result
        ? `${kb(input.byteLength)} → ${kb(result.buffer.byteLength)} ` +
            `(${((result.buffer.byteLength / input.byteLength) * 100).toFixed(1)}%) ${ms.toFixed(0)}ms ${result.contentType}`
        : "圧縮版を作らなかった",
    );
  }
}

/** 🔴 透過が残るか。左半分だけ不透明な PNG を作って、圧縮後のアルファを見る。 */
async function measureAlpha(): Promise<void> {
  const width = 400;
  const height = 400;
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      raw[offset] = 255;
      raw[offset + 1] = 0;
      raw[offset + 2] = 0;
      raw[offset + 3] = x < width / 2 ? 255 : 0;
    }
  }
  const png = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const result = await compressImage(png, await detectFormat(png));
  if (!result) {
    check("透過が残る", false, "圧縮版が作られなかった");
    return;
  }
  const { data, info } = await sharp(result.buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alphaRight = data[(info.width - 1) * 4 + 3];
  const alphaLeft = data[3];
  check(
    "圧縮しても透過が残る",
    alphaLeft === 255 && alphaRight === 0,
    `左のアルファ=${alphaLeft} 右のアルファ=${alphaRight}`,
  );
}

/** 🔴 アニメが残るか。**animated を付け忘れると 1 コマになる**（実測で確認済み）。 */
async function measureAnimation(): Promise<void> {
  const gif = dir ? await readFile(path.join(dir, "anim.gif")).catch(() => null) : null;
  if (!gif) {
    console.log("   anim.gif が無いのでアニメは測っていない（unverified）");
    return;
  }
  const source = await sharp(gif, { animated: true }).metadata();
  const result = await compressImage(gif, await detectFormat(gif));
  if (!result) {
    check("圧縮してもアニメが残る", false, "圧縮版が作られなかった");
    return;
  }
  const after = await sharp(result.buffer, { animated: true }).metadata();
  check(
    "圧縮してもアニメが残る",
    after.pages === source.pages && (source.pages ?? 1) > 1,
    `${source.pages}コマ → ${after.pages}コマ  ${kb(gif.byteLength)} → ${kb(result.buffer.byteLength)}`,
  );
}

/** 🔴 向きが正しいか。EXIF の向きを持つ画像を圧縮して、画素が起きているかを見る。 */
async function measureOrientation(): Promise<void> {
  const base = await sharp({
    create: { width: 1200, height: 600, channels: 3, background: { r: 10, g: 120, b: 200 } },
  })
    .jpeg()
    .toBuffer();
  const tagged = await sharp(base).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const result = await compressImage(tagged, await detectFormat(tagged));
  if (!result) {
    check("圧縮すると向きが直る", false, "圧縮版が作られなかった");
    return;
  }
  const after = await sharp(result.buffer).metadata();
  check(
    "圧縮すると向きが直る（画素が起きる）",
    after.width === 600 && after.height === 1200,
    `1200x600(orientation=6) → ${after.width}x${after.height}`,
  );
}

/** 🔴 SVG は対象にしない。🚨 §3.4 で attachment を強制している当のファイルを描画しない。 */
async function measureSvgSkipped(): Promise<void> {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="red"/><script>alert(1)</script></svg>',
    "utf8",
  );
  const format = await detectFormat(svg);
  const result = await compressImage(svg, format);
  check("SVG は圧縮しない", result === null, `sharp が読んだ形式=${format} 結果=${result ? "作った" : "作らなかった"}`);
}

/** 🚨 太らせない。既に小さい・最適な画像は圧縮版を作らない。 */
async function measureNoGrowth(): Promise<void> {
  const small = await sharp({
    create: { width: 200, height: 200, channels: 3, background: "#cc6633" },
  })
    .webp({ quality: 80 })
    .toBuffer();
  const result = await compressImage(small, await detectFormat(small));
  check(
    "太る場合は圧縮版を作らない",
    result === null,
    `元 ${small.byteLength}B / 結果=${result ? `${result.buffer.byteLength}B を作った` : "作らなかった"}`,
  );
}

/**
 * 正しい PNG の **IDAT（画素データ）だけを壊す**。IHDR は無傷なので寸法は読める。
 *
 * 🚨 なぜこの形の素材が要るか（2026-08-14 の実例）:
 *   受入ハーネスの対照 PNG がまさにこの状態だった（IDAT の CRC 不一致・zlib で展開できない）。
 *   `metadata()` は IHDR しか見ないので **32x32 と答える**。そのため
 *   「寸法が入っているのにブラーが null」＝実装の不具合、と誤って切り分けた。
 *   sharp / ffmpeg / 素の zlib の3つが揃って「壊れている」と言う素材だった。
 */
function corruptPixelData(png: Buffer): Buffer {
  const out = Buffer.from(png);
  let pos = 8; // PNG シグネチャの後ろから
  while (pos + 8 <= out.length) {
    const length = out.readUInt32BE(pos);
    const type = out.toString("ascii", pos + 4, pos + 8);
    if (type === "IDAT" && length > 4) {
      // zlib ヘッダの後ろを潰す（展開できない状態にする）。IHDR には触らない。
      out.fill(0xff, pos + 10, pos + 8 + length);
      return out;
    }
    pos += 12 + length;
  }
  return out;
}

/**
 * 🚨 **ヘッダは読めるのに画素が壊れている画像**。ここが今日の取り違えの本体。
 * 「寸法が読めた ＝ 画像として妥当」ではないことを、検査として固定しておく。
 */
async function measureHeaderOnlyImage(): Promise<void> {
  const valid = await sharp({
    create: { width: 32, height: 32, channels: 3, background: "#3366cc" },
  })
    .png()
    .toBuffer();
  const broken = corruptPixelData(valid);

  const meta = await sharp(broken).metadata().catch(() => null);
  check(
    "壊れた画素でも寸法だけは読める（＝寸法で妥当性を判断できない）",
    meta?.width === 32 && meta?.height === 32,
    `${meta?.width}x${meta?.height} format=${meta?.format}`,
  );

  let threw = false;
  let blur: string | null = null;
  let compressed: unknown = null;
  try {
    compressed = await compressImage(broken, meta?.format ?? null);
    blur = await createBlurDataUrl(broken, meta?.format ?? null);
  } catch {
    threw = true;
  }
  check(
    "画素が壊れていたら圧縮もブラーも作らない（例外は投げない）",
    !threw && compressed === null && blur === null,
    threw ? "例外を投げた" : "どちらも null",
  );
}

/** 🚨 壊れたファイルでも例外を投げない（アップロード自体を落とさない）。 */
async function measureBrokenInput(): Promise<void> {
  const broken = Buffer.from("これは画像ではありません", "utf8");
  let threw = false;
  let result: unknown = "未実行";
  try {
    result = await compressImage(broken, "png"); // 形式は png と偽って渡す
  } catch {
    threw = true;
  }
  check("壊れたファイルで例外を投げない", !threw && result === null, threw ? "例外を投げた" : "null を返した");

  // 画像でないもの（PDF・テキスト）は形式判定の時点で対象外になる。
  const pdf = Buffer.from("%PDF-1.4\n...", "utf8");
  const pdfResult = await compressImage(pdf, await detectFormat(pdf));
  check("画像でないものは圧縮しない", pdfResult === null, "null");
}

/**
 * ブラー版（読み込み中に出す極小画像）。
 * 🚨 **列（blur_data_url）はまだ無い**ので、ここで測るのは**生成だけ**。
 *    保存と API での返却は列が入ってから。
 */
async function measureBlur(): Promise<void> {
  const photo = dir ? await readFile(path.join(dir, "photo.jpg")).catch(() => null) : null;
  if (photo) {
    const started = performance.now();
    const dataUrl = await createBlurDataUrl(photo, await detectFormat(photo));
    const ms = performance.now() - started;
    check(
      "ブラー: data:image/webp;base64, で始まる",
      dataUrl !== null && dataUrl.startsWith("data:image/webp;base64,"),
      dataUrl ? `${dataUrl.slice(0, 30)}…` : "null",
    );
    check(
      "ブラー: 1KB 未満",
      dataUrl !== null && dataUrl.length < 1024,
      dataUrl ? `${dataUrl.length}文字 ${ms.toFixed(0)}ms` : "null",
    );
  } else {
    console.log("   photo.jpg が無いのでブラーの寸法は測っていない（unverified）");
  }

  // 🔴 向きを反映するか（ぼかしだけ横倒しだと、本画像と入れ替わる瞬間に飛ぶ）。
  const base = await sharp({
    create: { width: 1200, height: 600, channels: 3, background: { r: 10, g: 120, b: 200 } },
  })
    .jpeg()
    .toBuffer();
  const tagged = await sharp(base).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const rotatedBlur = await createBlurDataUrl(tagged, await detectFormat(tagged));
  if (rotatedBlur) {
    const decoded = Buffer.from(rotatedBlur.split(",")[1], "base64");
    const meta = await sharp(decoded).metadata();
    check(
      "ブラー: 向きを反映している（縦長になる）",
      (meta.height ?? 0) > (meta.width ?? 0),
      `${meta.width}x${meta.height}`,
    );
  } else {
    check("ブラー: 向きを反映している（縦長になる）", false, "生成できなかった");
  }

  // 🔴 SVG では作らない（§3.4 で attachment を強制している当のファイルを描画しない）。
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="red"/></svg>',
    "utf8",
  );
  check("ブラー: SVG では null", (await createBlurDataUrl(svg, await detectFormat(svg))) === null, "null");

  // 🔴 画像でないもの・壊れたものでは null（例外を投げない＝アップロードを落とさない）。
  const pdf = Buffer.from("%PDF-1.4\n...", "utf8");
  check("ブラー: PDF では null", (await createBlurDataUrl(pdf, await detectFormat(pdf))) === null, "null");
  let threw = false;
  let broken: string | null = null;
  try {
    broken = await createBlurDataUrl(Buffer.from("これは画像ではありません", "utf8"), "png");
  } catch {
    threw = true;
  }
  check("ブラー: 壊れたファイルで例外を投げない", !threw && broken === null, threw ? "例外を投げた" : "null");
}

async function main(): Promise<void> {
  await measureRealPhotos();
  await measureAlpha();
  await measureAnimation();
  await measureOrientation();
  await measureSvgSkipped();
  await measureNoGrowth();
  await measureBrokenInput();
  await measureHeaderOnlyImage();
  await measureBlur();
  console.log(failures === 0 ? "\nすべて通りました" : `\n落ちた項目: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
