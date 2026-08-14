/**
 * 不具合の報告（F2 §2-G）のドメイン層。
 *
 * ── この機能の設計で外せない3つ ──
 *
 * 1. 🚨 **DB 保存が本体。メール送信はおまけ。**
 *    宛先が未設定でも、SMTP が落ちていても、**報告は必ず保存され 201 を返す**。
 *    「メールが設定されていないだけでフォームが 500 になってはいけない」（仕様 §2-G）。
 *    送信の結果は mail_status に残すので、後から「送れていなかった」が分かる。
 *
 * 2. 🚨 **秘密を自動で集めない。**
 *    自動で付けるのは、利用者が見て分かるものだけ（報告者・開いていた画面・User-Agent）。
 *    環境変数・Cookie・トークン・リクエストヘッダ全体は**保存も送信もしない**。
 *    デバッグに要る情報は利用者が本文へ自分で書く。
 *
 * 3. 🚨 **送信の失敗理由に秘密を混ぜない。**
 *    SMTP のエラー文には接続先やユーザー名が入ることがあるので、
 *    DB へ入れる前に既知の秘密を伏せる。
 *
 * 契約 §2-2: `next/*` を import しない。
 */

import { randomUUID } from "node:crypto";

import { db } from "@/lib/db/knex";
import { ApiError } from "@/lib/schema/errors";
import { getSecretSetting, getSettings } from "@/lib/settings/service";

export type BugReport = {
  id: string;
  title: string;
  body: string;
  page_path: string | null;
  reporter: string | null;
  created_at: string;
  mail_status: MailStatus;
  mail_error: string | null;
};

/** skipped = 宛先や SMTP が未設定なので送らなかった（異常ではない）。 */
export type MailStatus = "skipped" | "sent" | "failed";

const MAX_TITLE = 255;
const MAX_BODY = 20_000;

/** 送信に要る設定。**1つでも欠けたら送らない**（中途半端な設定で失敗を量産しない）。 */
export type MailConfig = {
  to: string;
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  secure: boolean;
};

/**
 * 送信設定を読む。host/port/user/password は DB(GUI) → 環境変数 の順で解決する
 * （lib/settings/service.ts の getSettings()/getSecretSetting() が既に DB→env→既定値の
 * 解決をしている）。宛先(OHMYCMS_BUGREPORT_TO)と送信元(SMTP_FROM)は DB 化していないため
 * 環境変数のまま。揃っていなければ null。空文字は未設定として扱う。
 */
export async function mailConfig(): Promise<MailConfig | null> {
  const pick = (name: string) => {
    const value = process.env[name]?.trim();
    return value ? value : undefined;
  };

  const settings = await getSettings();
  const to = pick("OHMYCMS_BUGREPORT_TO");
  const host = settings.smtp_host || undefined;
  const port = settings.smtp_port || undefined;
  const user = settings.smtp_user || undefined;
  const password = await getSecretSetting("smtp_password");
  const from = pick("SMTP_FROM") ?? user;

  if (!to || !host || !port || !user || !password || !from) return null;

  const portNumber = Number.parseInt(port, 10);
  if (!Number.isInteger(portNumber) || portNumber <= 0) return null;

  return {
    to,
    host,
    port: portNumber,
    user,
    password,
    from,
    // 465 は最初から TLS、587 は STARTTLS が通例。明示されていればそれに従う。
    secure: pick("SMTP_SECURE") === "true" || portNumber === 465,
  };
}

/**
 * 実際に送る処理。**差し替え可能にしてある**理由:
 *   - MVP では送信手段を確定していない（依存を足すかどうかを司令塔が判断中）
 *   - テストから「送ったふり」を差し込めるようにしたい
 * 既定は「送らない」。差し替えられていなければ mail_status は skipped のままになる。
 */
export type MailSender = (config: MailConfig, mail: { subject: string; text: string }) => Promise<void>;

let sender: MailSender | null = null;
/** テストから差し替えたかどうか。差し替えられていれば既定の読み込みをしない。 */
let senderOverridden = false;

/** 送信手段を差し込む。テストから「送ったふり」を入れるのに使う。 */
export function setMailSender(next: MailSender | null): void {
  sender = next;
  senderOverridden = true;
}

/**
 * 送信手段を用意する。
 *
 * 🚨 **設定が揃っているときだけ nodemailer を読み込む。**
 *    未設定の環境では import すら起きないので、
 *    「メールを使っていないのに SMTP ライブラリの初期化で落ちる」が起こらない。
 */
async function resolveSender(): Promise<MailSender | null> {
  if (senderOverridden) return sender;
  if (!sender) {
    const { sendBugReportMail } = await import("./mailer");
    sender = sendBugReportMail;
  }
  return sender;
}

/** エラー文から既知の秘密を伏せる。DB へ入れる前に必ず通す。 */
function redactMailError(message: string, config: MailConfig): string {
  let text = message;
  for (const secret of [config.password, config.user]) {
    if (secret) text = text.split(secret).join(`<${secret.length}文字>`);
  }
  return text.slice(0, 512);
}

function validate(input: Record<string, unknown>): { title: string; body: string; pagePath: string | null } {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const body = typeof input.body === "string" ? input.body.trim() : "";

  if (!title) throw new ApiError(400, "INVALID_FIELD", "title を入力してください");
  if (!body) throw new ApiError(400, "INVALID_FIELD", "body を入力してください");
  if (title.length > MAX_TITLE) {
    throw new ApiError(400, "INVALID_FIELD", `title は${MAX_TITLE}文字までです`);
  }
  if (body.length > MAX_BODY) {
    throw new ApiError(400, "INVALID_FIELD", `body は${MAX_BODY}文字までです`);
  }

  // 開いていた画面はアプリ内の相対パスだけ受け取る（外部URLを report に貯めない）。
  const rawPath = typeof input.page_path === "string" ? input.page_path.trim() : "";
  const pagePath = rawPath.startsWith("/") ? rawPath.slice(0, 512) : null;

  return { title, body, pagePath };
}

/**
 * 報告を受け取る。**保存に成功したら、送信の可否に関わらず成功として返す。**
 *
 * @param userAgent リクエストの User-Agent。**それ以外のヘッダは渡さないこと**
 */
export async function submitBugReport(
  input: Record<string, unknown>,
  context: { reporter: string | null; userAgent: string | null },
): Promise<BugReport> {
  const { title, body, pagePath } = validate(input);

  const id = randomUUID();
  const createdAt = new Date();

  // ── ① まず保存する。ここが本体。 ──
  await db("ohmycms_bug_reports").insert({
    id,
    reporter: context.reporter,
    title,
    body,
    page_path: pagePath,
    user_agent: context.userAgent ? context.userAgent.slice(0, 512) : null,
    created_at: createdAt,
    mail_status: "skipped",
  });

  // ── ② 送れるなら送る。失敗しても報告は成功のまま。 ──
  let mailStatus: MailStatus = "skipped";
  let mailError: string | null = null;

  const config = await mailConfig();
  // 設定が揃っていないなら送信手段を用意すらしない（skipped のまま）。
  const send = config ? await resolveSender() : null;
  if (config && send) {
    try {
      await send(config, {
        subject: `[不具合報告] ${title}`,
        // 🚨 本文に自動で足すのは、利用者が見て分かるものだけ。
        //    環境変数・トークン・ヘッダは足さない。
        text: [
          `報告ID: ${id}`,
          `報告者: ${context.reporter ?? "(不明)"}`,
          `画面: ${pagePath ?? "(不明)"}`,
          "",
          body,
        ].join("\n"),
      });
      mailStatus = "sent";
    } catch (error) {
      mailStatus = "failed";
      mailError = redactMailError(
        error instanceof Error ? error.message : String(error),
        config,
      );
    }
    await db("ohmycms_bug_reports")
      .where({ id })
      .update({ mail_status: mailStatus, mail_error: mailError });
  }

  return {
    id,
    title,
    body,
    page_path: pagePath,
    reporter: context.reporter,
    created_at: createdAt.toISOString(),
    mail_status: mailStatus,
    mail_error: mailError,
  };
}

/** 管理者向けの一覧。報告者本人の分だけを見せる用途は MVP では作らない。 */
export async function listBugReports({ limit = 50 }: { limit?: number } = {}): Promise<BugReport[]> {
  const rows = await db("ohmycms_bug_reports")
    .select(
      "id",
      "reporter",
      "title",
      "body",
      "page_path",
      "created_at",
      "mail_status",
      "mail_error",
    )
    .orderBy("created_at", "desc")
    .limit(Math.min(Math.max(limit, 1), 200));

  return rows.map((row) => ({
    ...row,
    created_at: new Date(row.created_at).toISOString(),
  })) as BugReport[];
}
