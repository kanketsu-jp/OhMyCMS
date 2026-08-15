import { requireActor } from "@/lib/auth/context";
import { uploadFile, listFiles } from "@/lib/files/service";
import { errorResponse, ok } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";

export const runtime = "nodejs";

function formString(formData: FormData, key: string): string | null | undefined {
  const value = formData.get(key);
  if (value === null) return undefined;
  return typeof value === "string" && value !== "" ? value : null;
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    const formData = await request.formData();
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
