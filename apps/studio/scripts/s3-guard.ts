/**
 * `verify:s3` が **書き込む前に止まるか**を決める部分。
 *
 * 🚨 **わざと別ファイルにしてある。** 検証ハーネス本体は import しただけで走り出すので、
 *    判定だけを取り出して測れない（2026-08-15 に実際に踏んだ）。
 *    ここは**引数だけで決まる純粋な関数**なので、共有 DB も MinIO も触らずに
 *    「本番の名前なら止まる」ことを測れる。
 */
/** 本番で使っているバケット名。**この名前が実装に解決されたら、無条件で止める。** */
export const PRODUCTION_BUCKETS = new Set(["ohmycms"]);
/** 検証用に使ってよいバケット名。 */
export const VERIFY_BUCKET = "ohmycms-verify";
/**
 * 「ローカルの検証用ストレージ」とみなすホスト名。
 *
 * 🚨 **この一覧は、私の手元の docker 構成で決めた値**（`docker/compose.yml` の MinIO）。
 *    **別の環境では当たりません。** CI や他の人の機械で別名を使うなら、ここへ足すこと。
 * 🚨 **足りないと「ローカルなのに止まる」** …… 安全側に倒れるので、実害は「測れない」だけ。
 *    **余計に足すと「ローカルでないのに通る」** …… こちらは危険。**足すときは名前を1つずつ。**
 *
 * 🚨 **この一覧は守りの本体ではない。** 本体は「本番のバケット名なら無条件で落とす」で、
 *    そちらは**ホスト名に一切依存しません**（`--allow-remote` でも通らない）。
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "minio", "ohmycms-minio"]);

export type GuardInput = {
  driver: string;
  bucket: string | null;
  endpointHost: string | null;
  allowRemote: boolean;
};

/**
 * 書き込む前に、**実装が実際に使う設定**で安全かどうかを決める。
 *
 * 🚨 **以前は `process.env.S3_ENDPOINT` を直接見ていた。** ところが実装は
 *    `getSettings()` 経由で **DB を優先**して解決する（`lib/settings/service.ts:229`）。
 *    **守りが見る値と、実装が書き込む先が別々だった。**
 *    2026-08-15 実測: 共有設定に残っていた `s3_bucket="xx"` が環境変数に勝ち、
 *    守りは「ローカルだから安全」と言ったまま、**別のバケットへ向いていた**。
 *    **不正な名前だったので落ちて助かっただけ**で、実在する名前なら書いて消していた。
 *
 * 🚨 **純粋な関数にしてある**（引数だけで決まる）。共有 DB を書き換えずに
 *    「本番の名前なら止まる」ことを測れるようにするため。
 */
export function guardDecision(input: GuardInput): { ok: boolean; reason: string } {
  if (input.driver !== "s3") {
    return { ok: false, reason: `実装が使うのは ${input.driver} で、s3 ではありません（設定が届いていない）` };
  }
  // 🚨 **本番の名前は --allow-remote でも通さない。** 逃げ道を作ると、その日が必要な日になる。
  if (input.bucket && PRODUCTION_BUCKETS.has(input.bucket)) {
    return { ok: false, reason: `実装が使うバケットが本番の名前（${input.bucket}）です。無条件で止めます` };
  }
  if (input.allowRemote) {
    return { ok: true, reason: "--allow-remote（本番の名前でないことは確認済み）" };
  }
  if (!input.endpointHost || !LOCAL_HOSTS.has(input.endpointHost.split(":")[0])) {
    return { ok: false, reason: `エンドポイントがローカルではありません（${input.endpointHost ?? "解釈できません"}）` };
  }
  if (input.bucket !== VERIFY_BUCKET) {
    return { ok: false, reason: `実装が使うバケットが ${input.bucket} です。検証用は ${VERIFY_BUCKET} です` };
  }
  return { ok: true, reason: `ローカル（${input.endpointHost}）の ${input.bucket}` };
}

