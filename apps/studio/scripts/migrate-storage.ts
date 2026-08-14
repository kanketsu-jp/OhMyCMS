/**
 * ローカルに置いてあるファイルを、いま設定してある S3 互換ストレージへ移す。
 *
 *   bun --filter @ohmycms/studio migrate:storage           # 下見（何もしない）
 *   bun --filter @ohmycms/studio migrate:storage --apply   # 実際に移す
 *
 * 🚨 **元のローカルファイルは消さない。** 移した後も `.storage` に残る。
 *    消すのは、移行が正しかったと**目で確かめてから**手で行うこと。
 *    「移せたはず」で消すと戻せない。
 *
 * 🚨 これを動かさなくても壊れない。読み出しは `directus_files.storage` を見るので、
 *    ローカルのファイルはローカルから読み続けられる（切り替えても 404 にならない）。
 *    このスクリプトは「**過去の分も S3 へ寄せたい**」ときだけ使う。
 *
 * 移すもの:
 *   ・元のファイル（`filename_disk`）
 *   ・配信用の圧縮版（`<id>/compressed.webp`）があれば一緒に
 * 移さないもの:
 *   ・変換キャッシュ（`<id>/transformed/…`）。**次に要求された時に作り直される**ので運ばない
 */
import { db } from "../lib/db/knex";
import { getStorage, getStorageByName, getStorageStatus } from "../lib/storage";

const apply = process.argv.includes("--apply");
/**
 * 🚨 **1件だけ試せるようにする**（`--id <uuid>`）。
 *
 * 共有の DB には他の人が上げた行も入っている。**全部まとめて移す前に1件で確かめられる**方が安全で、
 * 本番でも「まず1件、目で見てから残り」という進め方ができる。
 * 指定が無ければ従来どおり local の行を全部対象にする。
 */
const idIndex = process.argv.indexOf("--id");
const onlyId = idIndex === -1 ? null : (process.argv[idIndex + 1] ?? null);

type Row = {
  id: string;
  storage: string;
  filename_disk: string | null;
  filename_download: string;
};

async function toBuffer(body: Buffer | ReadableStream): Promise<Buffer> {
  return Buffer.isBuffer(body) ? body : Buffer.from(await new Response(body).arrayBuffer());
}

async function main(): Promise<void> {
  const status = await getStorageStatus();
  if (status.driver !== "s3") {
    // 🚨 設定していないのに走らせても意味がない。**足りないものを名前で言う**（値は出さない）。
    console.error("移す先が設定されていません。S3 の設定を入れてから実行してください。");
    if (status.misconfigured) {
      console.error(`足りない環境変数: ${status.missing.join(", ")}`);
    }
    process.exit(2);
  }
  console.log(`移す先: bucket=${status.bucket} host=${status.endpointHost}`);
  console.log(apply ? "モード: 実行（--apply）" : "モード: 下見（何も変えません。実行するには --apply）");

  const query = db<Row>("directus_files")
    .select("id", "storage", "filename_disk", "filename_download")
    .where({ storage: "local" })
    .orderBy("uploaded_on");
  if (onlyId) query.andWhere({ id: onlyId });
  const rows = await query;
  if (onlyId) console.log(`対象を1件に絞っています: ${onlyId}`);

  if (rows.length === 0) {
    console.log("ローカルに置かれたファイルはありません。");
    await db.destroy();
    return;
  }
  console.log(`対象: ${rows.length} 件`);

  const target = await getStorage();
  const local = await getStorageByName("local");
  if (!local) {
    console.error("ローカルの保管先を解決できませんでした。");
    process.exit(1);
  }

  let moved = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const key = row.filename_disk;
    if (!key) {
      // ストレージに実体が無い行（アップロードが途中で失敗した等）。触らない。
      console.log(`skip  ${row.id}  実体がありません`);
      skipped += 1;
      continue;
    }

    try {
      const source = await local.head(key);
      if (!source) {
        // 🚨 DB は local と言っているのにファイルが無い。**移行では直せない**ので報告だけする。
        console.log(`skip  ${row.id}  ローカルに実体が見つかりません（${row.filename_download}）`);
        skipped += 1;
        continue;
      }

      if (!apply) {
        console.log(`移す  ${row.id}  ${row.filename_download}  ${source.size}B`);
        moved += 1;
        continue;
      }

      const body = await toBuffer(await local.get(key));
      await target.put(key, body, source.contentType);

      // 🚨 置けたことを**書いた側でなく読む側から**確かめる。put が成功しても
      //    サイズが違えば移せていない（途中で切れた・別の場所に書いた）。
      const written = await target.head(key);
      if (!written || written.size !== body.byteLength) {
        throw new Error(`書き込みを確認できませんでした（${written?.size ?? "なし"} / ${body.byteLength}）`);
      }

      // 配信用の圧縮版も一緒に運ぶ（あれば）。無くても壊れない（元から配信される）。
      const compressedKey = `${row.id}/compressed.webp`;
      const compressed = await local.head(compressedKey);
      if (compressed) {
        const compressedBody = await toBuffer(await local.get(compressedKey));
        await target.put(compressedKey, compressedBody, compressed.contentType ?? "image/webp");
      }

      // 🚨 DB を書き換えるのは**中身を移し終えてから**。先に書き換えると、
      //    途中で失敗したときに「S3 にあるはずなのに無い」行ができる。
      await db("directus_files").where({ id: row.id }).update({ storage: "s3" });
      console.log(`移した ${row.id}  ${row.filename_download}  ${body.byteLength}B${compressed ? "（圧縮版も）" : ""}`);
      moved += 1;
    } catch (error) {
      // 🚨 1件の失敗で全体を止めない。**残りは移せる**し、失敗した行は local のままなので読める。
      failed += 1;
      console.error(`失敗  ${row.id}  ${row.filename_download}: ${error instanceof Error ? error.message : "不明"}`);
    }
  }

  console.log(
    `\n${apply ? "移した" : "移せる"}: ${moved} 件 / 触らなかった: ${skipped} 件 / 失敗: ${failed} 件`,
  );
  if (apply && moved > 0) {
    console.log("🚨 ローカルの元ファイルは消していません。表示を確かめてから手で消してください。");
  }
  await db.destroy();
  process.exit(failed > 0 ? 1 : 0);
}

await main();
