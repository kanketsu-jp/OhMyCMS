import type { Knex } from "knex";

/**
 * 配信を軽くするための2列を `directus_files` に足す。
 *
 * 🚨 **列名に接頭辞を付けない**（Directus の慣習に合わせる）。
 *    このテーブルの既存列は `filename_disk` / `focal_point_x` のように全て接頭辞なしで、
 *    API は行をそのまま返す設計。ここだけ `ohmycms_` を付けると
 *    **同じテーブル・同じレスポンスの中で命名が2種類**になる。
 *    （Directus 本体に同名の列は無いので、当面の衝突もない）
 *
 * 🚨 **既存の列には触らない**。追加だけ。
 *
 * `blur_data_url`
 *   読み込み中に出す、ぼかした極小画像（`data:image/webp;base64,…`）。
 *   20px・q50 の WebP で **142B / 215文字**（実測）。1KB に収まる想定だが、
 *   将来 20px より大きくしたくなる余地を残して text にする。
 *   画像でないもの（PDF / 動画）と SVG では null。生成に失敗したときも null。
 *
 * `compressed_key`
 *   アップロード時に作った「配信用の圧縮版」の置き場所。null なら圧縮版なし
 *   （トグルで切った / 元より小さくならなかった / 画像でない）。
 *   🚨 **接頭辞（S3_KEY_PREFIX）を含まないキーを入れる**。既存の filename_disk と同じ規則。
 *     ここに接頭辞を焼き込むと、接頭辞を変えたときに二重に付く。
 *   🚨 キーを持つ理由: これが無いと配信のたびに head を1回投げて有無を調べることになる
 *     （S3 では往復が1回増える）。将来 WebP 以外にしたくなっても DB 側が正になる。
 *
 * 寸法（width / height）は**既にこのテーブルにあり、保存もされている**ので足さない。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("directus_files", (table) => {
    table.text("blur_data_url");
    table.string("compressed_key", 255);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("directus_files", (table) => {
    table.dropColumn("blur_data_url");
    table.dropColumn("compressed_key");
  });
}
