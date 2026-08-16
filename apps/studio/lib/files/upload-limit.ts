/**
 * アップロードの上限を **1 箇所**で決める。
 *
 * 🚨 **上限は 1 段ではない**（2026-08-16 実測）。詰まる場所が 2 つ在り、
 *    **別々に書くと、通す門と落とす門が食い違う**:
 * ```
 * ① アプリの検証        lib/files/service.ts が本文の大きさを見る
 * ② Next の要求の受け口  experimental.proxyClientMaxBodySize（**既定 10,485,760 ＝ 10MB**）
 *    🚨 `proxy.ts` が在るので、この上限が効く経路になる
 * ```
 *    直す前は ① が 50MB、② が既定の 10MB だったため、
 *    🚨 **50MB の判定へは一度も到達せず**、10MB 超で
 *    「サーバ内部でエラーが発生しました」（HTTP 500）が返っていた。
 *    利用者には「大きすぎます」ではなく「サーバが壊れた」に見える。
 *
 * 🚨 **だから、この 1 つの値から両方へ配る。**
 *    `next.config.ts` もここを読む（そうしないと、また片方だけ直る）。
 *
 * 由来: 堀池さん 296「**これは nextjs やサーバーの問題だと思うので見直して
 * 設定できるようにして。初期値は 20MB**」（2026-08-16）。
 *
 * 🚨 **測っていない段が 1 つ在る**: 本番の前段（Dokploy の Traefik）。
 *    `compose.dokploy.yml` に「Traefik ラベルは手書きしない。Dokploy が管理する」と
 *    書いてあり、**このリポジトリからは上限が分からない**。
 *    本番で 20MB が通るかは、そちら次第。
 */

/** 既定の上限（MB）。堀池さんの指示（296）で 20。 */
export const DEFAULT_MAX_UPLOAD_MB = 20;

/**
 * 上限（バイト）。`OHMYCMS_MAX_UPLOAD_MB` で変えられる。
 *
 * 🚨 **不正な値は既定へ倒す**（0 や負や文字を入れて**全部弾かれる**状態にしない）。
 * 🚨 **関数にしてある**のは、`next.config.ts` と実行時の両方から同じ値を引くため。
 */
export function maxUploadBytes(): number {
  const raw = process.env.OHMYCMS_MAX_UPLOAD_MB?.trim();
  const mb = raw ? Number(raw) : NaN;
  const 使う値 = Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_MAX_UPLOAD_MB;
  return Math.floor(使う値 * 1024 * 1024);
}

/**
 * Next の受け口に渡す上限。**アプリの上限より少し大きくする。**
 *
 * 🚨 同じ値にすると、**上限ちょうどのファイルが受け口で落ちる**。
 *    多重部分（multipart）の飾り（境界文字列・ファイル名・ヘッダ）が
 *    本文に上乗せされるため、**ファイルが上限内でも本文は上限を超える**。
 *    そうなると、こちらの「ファイルが大きすぎます」を出す前に落ちてしまい、
 *    **利用者には理由が出せない**。
 * 🚨 余裕は 1MB。飾りは実測で数百バイト程度だが、
 *    **ファイル名が長い場合**などを見込んで桁で余らせてある。
 */
export function proxyBodyLimitBytes(): number {
  return maxUploadBytes() + 1024 * 1024;
}

/** 画面・文言に出す用（「20MB 以下にしてください」の 20）。 */
export function maxUploadMb(): number {
  return Math.floor(maxUploadBytes() / 1024 / 1024);
}
