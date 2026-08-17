import { requireActor } from "@/lib/auth/context";
import { uploadFile, listFiles, deleteFiles } from "@/lib/files/service";
import { maxUploadMb, proxyBodyLimitBytes } from "@/lib/files/upload-limit";
import { errorResponse, ok, readJsonObject } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";

export const runtime = "nodejs";

const MAX_QUERY_LENGTH = 100;

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
 * 🚨 **詰まっていたのは Next の受け口だった**（2026-08-16 に出どころまで特定）:
 *   実測 9MB → 201 ／ 9.996MB → 500 ／ 10MB → 500 ／ 49MB → 500
 *   出どころ `experimental.proxyClientMaxBodySize` の既定 **10,485,760 ＝ ちょうど 10MB**
 *   （node_modules/next の config-shared.js。**実測の境目と一致した**）
 *   `proxy.ts` が在るので、この上限が効く経路になる。
 *   → いまは `lib/files/upload-limit.ts` の 1 つの値から、**この判定と Next の受け口の
 *     両方へ配っている**。数字をここへ書き戻さないこと。
 *   🚨 **本番の前段（Dokploy の Traefik）は未測定**。compose に
 *     「Traefik ラベルは手書きしない。Dokploy が管理する」と在り、repo からは分からない。
 */
async function readFormData(request: Request): Promise<FormData> {
  // 先に長さで弾く。ここで弾けば本文を読まずに済むので、無駄な転送も起きない。
  // 🚨 **比べる相手は「本文の上限」であって「ファイルの上限」ではない。**
  //    `content-length` は**多重部分の飾り**（境界文字列・ファイル名・ヘッダ）を含むので、
  //    ファイル本体より必ず大きい。ファイルの上限と比べると、
  //    🚨 **ちょうど上限のファイルが「上限以下にしてください」で弾かれる**——嘘になる。
  //    （2026-08-16 実測: 20MB ちょうど 20,971,520 バイトが 413 になった）
  //    正確な判定は service 側が**ファイルの実バイト数**で行う。ここは粗い門でよい。
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > proxyBodyLimitBytes()) {
    throw new ApiError(413, "FILE_TOO_LARGE", `ファイルサイズは${maxUploadMb()}MB以下にしてください`);
  }
  try {
    return await request.formData();
  } catch {
    // 🚨 ここに来るのは「長さは名乗っていないが、実際には読み切れなかった」場合。
    //    **500 にしない。** 中身を読めなかったこと自体は利用者に伝わる必要がある。
    //    🚨 `FILE_TOO_LARGE` と同じ文言にはしない——**大きさ以外の理由でも落ちうる**ので、
    //    「N MB 以下にしてください」と言い切ると嘘になる場合がある。
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
    // 🚨 **空の File は「ファイルが在る」ではない。**
    //    `value instanceof File` は **0 バイト・名前なし**でも true になる。
    //    実測 2026-08-17（:3102・ブラウザ）: アップロードが 1 回成功したあと、
    //    画面は「1 件を選びました <名前>」と出したままなのに `<input type=file>` の
    //    `files.length` は **0**（React 19 が action のあとフォームを reset するため）。
    //    その状態でもう一度押すと **空の File が飛び、201 で
    //    「名前が空・0 バイト・title は "file"」の行が無言で増えていた**。
    //    ＝ 利用者から見ると「アップロードできないのに増えている」。
    // 🚨 `FILE_REQUIRED` に相乗りさせない——**「選んでいない」と「選んだものが空」は、
    //    利用者がとる行動が違う**（後者は**選び直す**）。
    // 🚨 **名前を先に見る。順番がこの区別を決める。**
    //    【測った 2026-08-17・ブラウザ】**何も選ばずに送ると**、ブラウザは
    //    `File { name: "", size: 0, type: "application/octet-stream" }` を送る。
    //    ＝ 🚨 **名前が空であることが「選んでいない」の signal**。
    //    size を先に見ると **必ず `FILE_EMPTY` に当たり**、選んでいない人に
    //    「**選び直してください**」と言うことになる（＝ 上のコメントの意図を、順番が打ち消す）。
    //    **次に触る人へ: size を先に戻さないこと。**
    if (value.name.trim() === "") {
      throw new ApiError(400, "FILE_REQUIRED", "fileフィールドにファイルを指定してください");
    }
    if (value.size === 0) {
      throw new ApiError(400, "FILE_EMPTY", "中身のないファイルは送れません");
    }
    const overrideName = formString(formData, "filename")?.trim();
    const body = Buffer.from(await value.arrayBuffer());
    const row = await uploadFile(actor, {
      filename: overrideName && overrideName.length > 0 ? overrideName : value.name,
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

/**
 * まとめてゴミ箱へ入れる。`{ "ids": ["…", "…"] }`
 *
 * 🚨 **204 を返さない。** 「成功」とだけ返すと、**利用者は全部消えたと読む**。
 *    30 件のうち 3 件が権限で弾かれることが実際に起きるので、
 *    **200 ＋ `{ deleted, failed }`** で、**何件入って、どれがなぜ入らなかったか**を必ず返す。
 * 🚨 **1 件も入らなくても 200**。**「失敗」を状態コードで表さない**——
 *    `failed` が全件という**事実**は本文に在り、状態コードにすると
 *    「どれが失敗したか」を呼ぶ側が読まずに済ませてしまう。
 * 🚨 **1 件ずつの口（`DELETE /api/files/<id>`）は 204 のまま**。あちらは対象が 1 つなので
 *    「入ったか / 入らなかったか」が状態コードで足りる。**形を揃えるために変えない**。
 */
export async function DELETE(request: Request) {
  try {
    const actor = await requireActor(request);
    const body = await readJsonObject(request);
    const ids = body.ids;
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || id === "")) {
      throw new ApiError(400, "IDS_REQUIRED", "idsに1件以上のidを指定してください");
    }
    return ok({ data: await deleteFiles(actor, ids as string[]) });
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
        q: url.searchParams.get("q")?.slice(0, MAX_QUERY_LENGTH) ?? null,
      }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
