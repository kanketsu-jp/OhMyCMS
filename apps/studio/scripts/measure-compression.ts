/**
 * 圧縮とブラーの実測（**設計を決めるための調査用**。受入ハーネスではない）。
 *
 *   bun run scripts/measure-compression.ts <素材ディレクトリ>
 *
 * 測るもの:
 *   1. 原寸の圧縮（WebP / AVIF・長辺の上限・品質）で**何バイトが何バイトになるか**
 *   2. ブラー版（極小 WebP の base64）が**1KB 未満に収まるか**
 *   3. 壊れやすい3つ（**透過が残るか / アニメが残るか / EXIF の向きが直るか**）
 *   4. 🚨 **小さい画像を圧縮すると逆に大きくなるか**（既に最適な画像を太らせないため）
 *   5. サムネのオンデマンド生成に**何ミリ秒かかるか**（事前生成が要るかの判断材料）
 *
 * 🚨 素材は ffmpeg の mandelbrot で作った合成画像。**実写真ではない**ので、
 *    圧縮率の絶対値は実写真とずれる。傾向を見るための数字として扱うこと。
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Sharp } from "sharp";

const dir = process.argv[2];
if (!dir) {
  console.error("素材ディレクトリを渡してください");
  process.exit(2);
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)}KB`;
}

function ratio(before: number, after: number): string {
  return `${((after / before) * 100).toFixed(1)}%`;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = performance.now();
  const value = await fn();
  return { value, ms: performance.now() - started };
}

/** 1. 原寸の圧縮。長辺の上限と形式・品質の組み合わせで測る。 */
async function measureCompression(name: string, input: Buffer): Promise<void> {
  const meta = await sharp(input).metadata();
  console.log(`\n■ ${name}  ${meta.width}x${meta.height}  ${kb(input.byteLength)}  (${meta.format})`);

  const variants: Array<{ label: string; limit?: number; run: (p: Sharp) => Sharp }> = [
    { label: "webp q80 上限なし", run: (p) => p.webp({ quality: 80 }) },
    { label: "webp q80 長辺2000", limit: 2000, run: (p) => p.webp({ quality: 80 }) },
    { label: "webp q75 長辺2000", limit: 2000, run: (p) => p.webp({ quality: 75 }) },
    { label: "webp q80 長辺3000", limit: 3000, run: (p) => p.webp({ quality: 80 }) },
    { label: "avif q50 長辺2000", limit: 2000, run: (p) => p.avif({ quality: 50 }) },
  ];

  for (const variant of variants) {
    const { value, ms } = await timed(async () => {
      let pipeline = sharp(input).rotate();
      if (variant.limit) {
        pipeline = pipeline.resize({
          width: variant.limit,
          height: variant.limit,
          fit: "inside",
          withoutEnlargement: true,
        });
      }
      return variant.run(pipeline).toBuffer();
    });
    console.log(
      `   ${variant.label.padEnd(20)} ${kb(input.byteLength)} → ${kb(value.byteLength).padEnd(9)} ` +
        `(${ratio(input.byteLength, value.byteLength).padStart(6)})  ${ms.toFixed(0)}ms`,
    );
  }
}

/** 2. ブラー版。極小 WebP を base64 にして「1KB 未満か」を見る。 */
async function measureBlur(name: string, input: Buffer): Promise<void> {
  console.log(`\n■ ブラー: ${name}`);
  for (const size of [16, 20, 24, 32]) {
    for (const quality of [40, 50, 60]) {
      const { value, ms } = await timed(() =>
        sharp(input)
          .rotate()
          .resize(size, size, { fit: "inside" })
          .blur(1)
          .webp({ quality })
          .toBuffer(),
      );
      const dataUrl = `data:image/webp;base64,${value.toString("base64")}`;
      const flag = dataUrl.length < 1024 ? "  " : "🚨";
      console.log(
        `   ${flag} ${String(size).padStart(2)}px q${quality}  webp ${String(value.byteLength).padStart(4)}B  ` +
          `dataUrl ${String(dataUrl.length).padStart(4)}文字  ${ms.toFixed(0)}ms`,
      );
    }
  }
}

/** 3-a. 透過が残るか。アルファ付き PNG を作って、変換後のアルファを実測する。 */
async function measureAlpha(): Promise<void> {
  console.log("\n■ 透過が残るか（左半分だけ不透明な PNG を作って変換後のアルファを見る）");
  const width = 100;
  const height = 100;
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      raw[offset] = 255;
      raw[offset + 1] = 0;
      raw[offset + 2] = 0;
      raw[offset + 3] = x < width / 2 ? 255 : 0; // 右半分を透明にする
    }
  }
  const png = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();

  for (const [label, buffer] of [
    ["元の PNG", png],
    ["webp q80", await sharp(png).webp({ quality: 80 }).toBuffer()],
    ["avif q50", await sharp(png).avif({ quality: 50 }).toBuffer()],
    ["🚨 jpeg q80", await sharp(png).jpeg({ quality: 80 }).toBuffer()],
  ] as const) {
    const meta = await sharp(buffer).metadata();
    const { data } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // 右上の画素（透明であるべき）のアルファ値を見る。
    const alphaRight = data[(0 * width + (width - 1)) * 4 + 3];
    const alphaLeft = data[(0 * width + 0) * 4 + 3];
    console.log(
      `   ${label.padEnd(12)} hasAlpha=${String(meta.hasAlpha).padEnd(5)} ` +
        `左のアルファ=${alphaLeft} 右のアルファ=${alphaRight} ${alphaRight === 0 ? "→ 透過が残った" : "→ 🚨 透過が消えた"}`,
    );
  }
}

/** 3-b. アニメが残るか。animated 指定の有無でフレーム数を比べる。 */
async function measureAnimation(gif: Buffer | null): Promise<void> {
  console.log("\n■ アニメが残るか（animated 指定の有無でフレーム数を比べる）");
  if (!gif) {
    console.log("   素材の GIF が無いので測っていない（unverified）");
    return;
  }
  const source = await sharp(gif, { animated: true }).metadata();
  console.log(`   元の GIF  pages=${source.pages} ${source.width}x${source.pageHeight}`);

  const naive = await sharp(gif).webp({ quality: 80 }).toBuffer();
  const naiveMeta = await sharp(naive, { animated: true }).metadata();
  console.log(
    `   🚨 animated 指定なし → webp  pages=${naiveMeta.pages} ${kb(naive.byteLength)} ` +
      `${(naiveMeta.pages ?? 1) < (source.pages ?? 1) ? "→ 🚨 1コマ目だけになった" : ""}`,
  );

  const animated = await sharp(gif, { animated: true }).webp({ quality: 80 }).toBuffer();
  const animatedMeta = await sharp(animated, { animated: true }).metadata();
  console.log(
    `      animated 指定あり → webp  pages=${animatedMeta.pages} ${kb(animated.byteLength)} ` +
      `(${ratio(gif.byteLength, animated.byteLength)}) ` +
      `${animatedMeta.pages === source.pages ? "→ アニメが残った" : "→ 🚨 コマ数が変わった"}`,
  );

  // 🚨 アニメを resize すると壊れやすい（pageHeight を跨いで潰す実装がある）ので一緒に測る。
  const resized = await sharp(gif, { animated: true })
    .resize({ width: 160 })
    .webp({ quality: 80 })
    .toBuffer();
  const resizedMeta = await sharp(resized, { animated: true }).metadata();
  console.log(
    `      animated + resize → webp  pages=${resizedMeta.pages} ${kb(resized.byteLength)} ` +
      `${resizedMeta.pages === source.pages ? "→ アニメが残った" : "→ 🚨 コマ数が変わった"}`,
  );
}

/** 3-c. EXIF の向き。orientation=6 を付けた JPEG を rotate() で起こせるか。 */
async function measureOrientation(): Promise<void> {
  console.log("\n■ EXIF の向きが直るか（横長 200x100 に orientation=6 を付ける）");
  const base = await sharp({
    create: { width: 200, height: 100, channels: 3, background: { r: 10, g: 120, b: 200 } },
  })
    .jpeg()
    .toBuffer();
  const tagged = await sharp(base).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const taggedMeta = await sharp(tagged).metadata();
  console.log(`   元  ${taggedMeta.width}x${taggedMeta.height} orientation=${taggedMeta.orientation}`);

  const withoutRotate = await sharp(tagged).webp().toBuffer();
  const withoutMeta = await sharp(withoutRotate).metadata();
  console.log(
    `   🚨 rotate() なし → ${withoutMeta.width}x${withoutMeta.height} orientation=${withoutMeta.orientation ?? "なし"}` +
      `${withoutMeta.width === 200 ? " → 🚨 向きの情報が消え、横倒しのまま固定された" : ""}`,
  );

  const withRotate = await sharp(tagged).rotate().webp().toBuffer();
  const withMeta = await sharp(withRotate).metadata();
  console.log(
    `      rotate() あり → ${withMeta.width}x${withMeta.height} orientation=${withMeta.orientation ?? "なし"}` +
      `${withMeta.width === 100 ? " → 画素が起きた（縦長になった）" : " → 🚨 起きていない"}`,
  );
}

/** 4. 小さい画像を圧縮すると逆に太るか。 */
async function measureSmallImages(): Promise<void> {
  console.log("\n■ 小さい画像を圧縮すると太るか（太るなら元をそのまま使う判定が要る）");
  const cases: Array<[string, Buffer]> = [
    [
      "単色 32x32 png",
      await sharp({ create: { width: 32, height: 32, channels: 3, background: "#3366cc" } })
        .png()
        .toBuffer(),
    ],
    [
      "単色 640x480 png",
      await sharp({ create: { width: 640, height: 480, channels: 3, background: "#3366cc" } })
        .png()
        .toBuffer(),
    ],
    [
      "既に webp 200x200",
      await sharp({ create: { width: 200, height: 200, channels: 3, background: "#cc6633" } })
        .webp({ quality: 80 })
        .toBuffer(),
    ],
  ];
  for (const [label, buffer] of cases) {
    const compressed = await sharp(buffer).rotate().webp({ quality: 80 }).toBuffer();
    const grew = compressed.byteLength >= buffer.byteLength;
    console.log(
      `   ${grew ? "🚨" : "  "} ${label.padEnd(18)} ${buffer.byteLength}B → ${compressed.byteLength}B ` +
        `(${ratio(buffer.byteLength, compressed.byteLength)}) ${grew ? "→ 🚨 太った" : ""}`,
    );
  }
}

/** 5. サムネのオンデマンド生成にかかる時間（事前生成が要るかの判断材料）。 */
async function measureThumbnailLatency(input: Buffer): Promise<void> {
  console.log("\n■ サムネをオンデマンドで作る時間（一覧の初回表示にかかる分）");
  for (const width of [200, 400, 800]) {
    const runs: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const { ms } = await timed(() =>
        sharp(input).rotate().resize({ width }).webp({ quality: 80 }).toBuffer(),
      );
      runs.push(ms);
    }
    const best = Math.min(...runs);
    console.log(`   ${String(width).padStart(3)}px 幅  ${best.toFixed(0)}ms（3回の最小）`);
  }
}

async function main(): Promise<void> {
  const photoPng = await readFile(path.join(dir, "photo.png"));
  const photoJpg = await readFile(path.join(dir, "photo.jpg"));
  const gif = await readFile(path.join(dir, "anim.gif")).catch(() => null);

  await measureCompression("photo.png（合成・ffmpeg mandelbrot）", photoPng);
  await measureCompression("photo.jpg（合成・ffmpeg mandelbrot）", photoJpg);
  await measureBlur("photo.jpg", photoJpg);
  await measureAlpha();
  await measureAnimation(gif);
  await measureOrientation();
  await measureSmallImages();
  await measureThumbnailLatency(photoJpg);
}

await main();
