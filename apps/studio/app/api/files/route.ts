import { requireActor } from "@/lib/auth/context";
import { uploadFile, listFiles, MAX_UPLOAD_SIZE } from "@/lib/files/service";
import { errorResponse, ok } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";

export const runtime = "nodejs";

function formString(formData: FormData, key: string): string | null | undefined {
  const value = formData.get(key);
  if (value === null) return undefined;
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * 送られてきた本文を読む。**大きすぎるときに 500 を返さない**ための包み。
 *
 * 🚨 2026-08-16 実測。50MB 超を送ると **HTTP 500 / INTERNAL_ERROR** が返っていた:
 *   `[api] 未処理の例外: "TypeError: Failed to parse body as FormData."`
 *   ＝ **`request.formData()` が先に落ちるので、`lib/files/service.ts` の
 *   50MB 判定（`FILE_TOO_LARGE`）に一度も到達していなかった**（＝死んだ文言）。
 *   利用者には「大きすぎます」ではなく「サーバ内部でエラー」が出るので、
 *   **自分が悪いのか、こちらが壊れたのか区別が付かない**。
 *
 * 🚨 **そして上限は 50MB ではない。** 同じ日の実測（:3102 開発サーバ）:
 *   9MB → 201 ／ 9.996MB → 500 ／ 10MB → 500 ／ 49MB → 500
 *   ＝ **9MB と 10MB のあいだで落ちる**。`MAX_UPLOAD_SIZE`(50MB) はそこまで届かない。
 *   由来は Next の要求処理側で、`proxy.ts` は本文に触れていない（実測 0 件）。
 *   🚨 **本番ビルド(:3101)では未測定**（dev-login が本番には無いため入れなかった）。
 *   → **「50MB まで」という案内が実態と違う**。上限をいくつにするかは決めが要る。
 */
async function readFormData(request: Request): Promise<FormData> {
  // 先に長さで弾く。ここで弾けば本文を読まずに済むので、無駄な転送も起きない。
  // 🚨 `content-length` は**多重部分の飾りを含む**ので、ファイル本体より少し大きい。
  //    ここは「明らかに超えている」を弾くための門で、正確な判定は service 側が行う。
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_SIZE) {
    throw new ApiError(413, "FILE_TOO_LARGE", "ファイルサイズは50MB以下にしてください");
  }
  try {
    return await request.formData();
  } catch {
    // 🚨 ここに来るのは「長さは名乗っていないが、実際には読み切れなかった」場合。
    //    **500 にしない。** 中身を読めなかったこと自体は利用者に伝わる必要がある。
    //    🚨 `FILE_TOO_LARGE` と同じ文言にはしない——**上限より小さくても落ちる**ので、
    //    「50MB 以下にしてください」と言うと**嘘になる**（9MB 台で落ちた実測がある）。
    throw new ApiError(413, "UPLOAD_BODY_UNREADABLE", "アップロードの内容を読み取れませんでした");
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    const formData = await readFormData(request);
    const value = formData.get("file");
    if (!(value instanceof File)) {
      throw new ApiError(400, "FILE_REQUIRED", "fileフィールドにファイルを指定してください");
    }
    const body = Buffer.from(await value.arrayBuffer());
    const row = await uploadFile(actor, {
      filename: value.name,
      contentType: value.type,
      body,
      title: formString(formData, "title"),
      description: formString(formData, "description"),
      tags: formString(formData, "tags"),
      folder: formString(formData, "folder"),
      // 🚨 既定は圧縮する。**"false" と明示されたときだけ**切る。
      //    未指定（undefined）を「切る」と読まないこと。
      compress: formData.get("compress") === "false" ? false : undefined,
    });
    return ok({ data: row }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    const url = new URL(request.url);
    return ok({
      data: await listFiles(actor, {
        limit: url.searchParams.get("limit"),
        offset: url.searchParams.get("offset"),
        folder: url.searchParams.get("folder"),
        label: url.searchParams.get("label"),
      }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
