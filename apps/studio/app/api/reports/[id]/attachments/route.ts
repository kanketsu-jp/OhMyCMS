import { requireActor } from "@/lib/auth/context";
import { proxyBodyLimitBytes, maxUploadMb } from "@/lib/files/upload-limit";
import { addAttachment, listAttachments } from "@/lib/reports/attachments";
import { canManageReports, getBugReportThread } from "@/lib/reports/service";
import { errorResponse, ok } from "@/lib/schema/api";
import { ApiError } from "@/lib/schema/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

async function readFormData(request: Request): Promise<FormData> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > proxyBodyLimitBytes()) {
    throw new ApiError(413, "FILE_TOO_LARGE", `ファイルサイズは${maxUploadMb()}MB以下にしてください`);
  }
  try {
    return await request.formData();
  } catch {
    throw new ApiError(413, "UPLOAD_BODY_UNREADABLE", "アップロードの内容を読み取れませんでした");
  }
}

function fileFromFormData(formData: FormData): File {
  const value = formData.get("file");
  if (!(value instanceof File)) {
    throw new ApiError(400, "FILE_REQUIRED", "fileフィールドにファイルを指定してください");
  }
  return value;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const actor = await requireActor(request);
    const viewer = actor.type === "human" ? actor.userId : actor.onBehalfOf;
    const { id } = await params;

    const isManager = await canManageReports(actor);
    await getBugReportThread(id, { viewer, isManager });
    return ok({ data: await listAttachments(id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const actor = await requireActor(request);
    const uploadedBy = actor.type === "human" ? actor.userId : actor.onBehalfOf;
    const { id } = await params;

    const isManager = await canManageReports(actor);
    await getBugReportThread(id, { viewer: uploadedBy, isManager });
    const formData = await readFormData(request);
    return ok({ data: await addAttachment(id, fileFromFormData(formData), { uploadedBy }) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
