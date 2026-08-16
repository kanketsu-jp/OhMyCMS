/**
 * ゴミ箱まわりで、**サーバとブラウザの両方が読む形**。
 *
 * 🚨 **なぜ別のファイルか。** `lib/trash/purge.ts` は knex を掴む（サーバ専用）ので、
 * client component からは import できない。かといって**同じ形を 2 箇所に持つと、
 * 片方だけ直って腐る**（今日ずっと潰してきた形）。
 *
 * 🚨 **`import type` で引けば実体は消えるので、purge.ts から直に引くこともできる。**
 * それをせずにこのファイルを置いたのは、**「皆が `import type` と書くのを覚えている」に
 * 依存させないため**——1 人が `import` と書いた日に、client のバンドルへ knex が入る。
 * ＝ **前提を守らせるのではなく、前提が要らない形にする。**
 *
 * ここには **型だけ**を置く。**値も import も足さないこと。**
 */

/** 直近の掃除の走行。**まだ 1 度も走っていなければ `null`。** */
export type LastPurgeRun = {
  started_at: string;
  finished_at: string | null;
  deleted_total: number;
  /**
   * 落ちたときだけ入る。
   *
   * 🚨 **`null`（まだ 1 度も走っていない）と `deleted_total: 0`（走ったが消すものが無かった）は
   * 別のこと。** 同じ文言にすると「動いていない」と「正常」が同じ顔になる。
   */
  error: string | null;
};
