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

import type { Actor } from "@/lib/auth/context";
import { db } from "@/lib/db/knex";
import { createNotification } from "@/lib/notifications/service";
import { resolvePermission, type PermissionAction } from "@/lib/permissions/resolve";
import { listAttachments, type BugReportAttachment } from "@/lib/reports/attachments";
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
  // ── チャット化で足した分（20260815020000）──
  status: BugReportStatus;
  resolved_at: string | null;
  resolved_by: string | null;
  /** 🚨 まだ返信が無ければ null。並べるときは `?? created_at` で扱うこと */
  last_message_at: string | null;
  /** 本来どうなるはずだったか（Why）。人が書く */
  expected: string | null;
  // 自動で入れる再現用の情報（秘密ではないものだけ）
  viewport: string | null;
  locale: string | null;
  app_version: string | null;
};

/** open = 未解決（既定） / resolved = 解決済み。一覧のタブがこの 2 つ。 */
export type BugReportStatus = "open" | "resolved";

/**
 * チャットの 1 行。
 * 🚨 `kind` が `resolved` / `reopened` の行は**状態が変わった記録**で、`body` は空。
 *    文言は表示側が辞書から引く（DB に日本語を入れない）。
 */
export type BugReportMessage = {
  id: string;
  report: string;
  author: string | null;
  body: string;
  kind: BugReportMessageKind;
  created_at: string;
};

export type BugReportMessageKind = "message" | "resolved" | "reopened";

/** 報告そのもの（1 通目）＋ それ以降のやりとり。 */
export type BugReportThread = {
  report: BugReport;
  attachments: BugReportAttachment[];
  messages: BugReportMessage[];
};

/** skipped = 宛先や SMTP が未設定なので送らなかった（異常ではない）。 */
export type MailStatus = "skipped" | "sent" | "failed";

const MAX_TITLE = 255;
const MAX_BODY = 20_000;

/**
 * 🚨 見出しは本文の 1 行目から作る（堀池さん 2026-08-17・原文「件名入力は不要です」）。
 * **画面から欄を消したので、来ないのが普通**。
 * 値そのものは残す（一覧の見出し・メールの件名・お知らせの差し込みが読む）。
 */
export function titleFromBody(body: string): string {
  const title = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!title) return "";
  if (title.length <= MAX_TITLE) return title;

  return `${title.slice(0, MAX_TITLE - 1)}…`;
}

/** 報告が保存される表の名前。**権限の宛先としても使う**ので 1 箇所に置く。 */
export const BUG_REPORTS_COLLECTION = "ohmycms_bug_reports";

/**
 * 「管理」とみなす操作の集合。
 *
 * 堀池さん（2026-08-15 原文）:
 * > 「不具合のポリシーで『**管理（閲覧、更新、編集、削除が含まれる）**』の場合のみ、
 * >   左サイドバーでは『不具合報告』のアコーディオンに、
 * >   『報告する』『**報告管理**』（**報告一覧はない**）があるようにする。」
 *
 * → 新しい capability を作らず、**既にある「コレクションごとの操作」の枠**で表す。
 */
const MANAGE_ACTIONS: readonly PermissionAction[] = ["read", "create", "update", "delete"];

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

/** 受け取った値を短く刈る。**入っていなければ null**（空文字を貯めない）。 */
function trimmedOrNull(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}

function validate(input: Record<string, unknown>): {
  title: string;
  body: string;
  pagePath: string | null;
  expected: string | null;
  viewport: string | null;
  locale: string | null;
} {
  let title = typeof input.title === "string" ? input.title.trim() : "";
  const body = typeof input.body === "string" ? input.body.trim() : "";

  if (!body) throw new ApiError(400, "INVALID_FIELD", "body を入力してください");
  if (title && title.length > MAX_TITLE) {
    throw new ApiError(400, "INVALID_FIELD", `title は${MAX_TITLE}文字までです`);
  }
  if (body.length > MAX_BODY) {
    throw new ApiError(400, "INVALID_FIELD", `body は${MAX_BODY}文字までです`);
  }
  if (!title) title = titleFromBody(body);
  if (!title) throw new ApiError(400, "INVALID_FIELD", "title を入力してください");

  // 開いていた画面はアプリ内の相対パスだけ受け取る（外部URLを report に貯めない）。
  const rawPath = typeof input.page_path === "string" ? input.page_path.trim() : "";
  const pagePath = rawPath.startsWith("/") ? rawPath.slice(0, 512) : null;

  const expected = trimmedOrNull(input.expected, MAX_BODY);

  // 🚨 再現用の情報は**形が決まっているものだけ**を受け取る。
  //    画面から来る値をそのまま貯めると、報告の入れ物が
  //    「何でも入る自由記述の袋」になり、秘密が紛れ込む余地ができる。
  const rawViewport = trimmedOrNull(input.viewport, 32);
  // 例: "390x844"。数字 x 数字の形だけ通す。
  const viewport = rawViewport && /^\d{1,5}x\d{1,5}$/.test(rawViewport) ? rawViewport : null;

  const rawLocale = trimmedOrNull(input.locale, 16);
  // 例: "ja" / "en-US"。英字とハイフンだけ。
  const locale = rawLocale && /^[A-Za-z-]{2,16}$/.test(rawLocale) ? rawLocale : null;

  return { title, body, pagePath, expected, viewport, locale };
}

/**
 * 報告を受け取る。**保存に成功したら、送信の可否に関わらず成功として返す。**
 *
 * @param userAgent リクエストの User-Agent。**それ以外のヘッダは渡さないこと**
 */
export async function submitBugReport(
  input: Record<string, unknown>,
  context: {
    reporter: string | null;
    userAgent: string | null;
    /**
     * 動いている版。
     * 🚨 **画面から受け取らない。** 「どの版で起きたか」は報告を読む側が信じる情報なので、
     *    送信側が名乗れる形にしない（呼ぶ側がサーバで求めて渡す）。
     */
    appVersion?: string | null;
  },
): Promise<BugReport> {
  const { title, body, pagePath, expected, viewport, locale } = validate(input);
  const appVersion = context.appVersion ? context.appVersion.slice(0, 64) : null;

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
    // 🚨 新しい報告は必ず未解決から始まる（列の既定値と同じだが、明示しておく）。
    status: "open",
    expected,
    viewport,
    locale,
    app_version: appVersion,
    // 🚨 `last_message_at` は入れない。**まだ誰も返信していない**ので null が正しい。
    //    ここで created_at を入れると「返信があった」と区別が付かなくなる。
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
    status: "open",
    resolved_at: null,
    resolved_by: null,
    last_message_at: null,
    expected,
    viewport,
    locale,
    app_version: appVersion,
  };
}

const REPORT_COLUMNS = [
  "id",
  "reporter",
  "title",
  "body",
  "page_path",
  "created_at",
  "mail_status",
  "mail_error",
  "status",
  "resolved_at",
  "resolved_by",
  "last_message_at",
  "expected",
  "viewport",
  "locale",
  "app_version",
] as const;

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

function presentReport(row: Record<string, unknown>): BugReport {
  return {
    ...(row as unknown as BugReport),
    created_at: toIso(row.created_at as Date) as string,
    resolved_at: toIso(row.resolved_at as Date | null),
    last_message_at: toIso(row.last_message_at as Date | null),
  };
}

function presentMessage(row: Record<string, unknown>): BugReportMessage {
  return {
    ...(row as unknown as BugReportMessage),
    created_at: toIso(row.created_at as Date) as string,
  };
}

/**
 * その人が不具合報告を**管理できるか**。
 *
 * 「管理」＝ `ohmycms_bug_reports` に対して**閲覧・追加・更新・削除の 4 つすべて**が
 * 許されていること。`admin_access` を持つ人は `resolvePermission` が 4 つとも
 * 許可を返すので、自然に true になる（逃げ道を別に書かない）。
 *
 * 🚨 **既定は false。** `directus_permissions` に `ohmycms_bug_reports` の行が
 *    1 つも無い状態（＝今の初期状態）では、誰も管理者にならない。
 *    権限を足す作業をしていない既存のポリシーが、黙って管理権限を得ることはない。
 */
export async function canManageReports(actor: Actor): Promise<boolean> {
  for (const action of MANAGE_ACTIONS) {
    const resolution = await resolvePermission(actor, BUG_REPORTS_COLLECTION, action);
    if (!resolution.allowed) return false;
  }
  return true;
}

/**
 * チャットルームの一覧。
 *
 * 堀池さん（2026-08-15）:
 * > 「**報告一覧では未解決のチャットルームが並ぶ**。ページ最初（上部）には
 * >   『未解決』『解決済み』のタブ。**管理者の『報告管理』ページには全てのチャット**が表示。」
 *
 * 🚨 `scope: "mine"` は **SQL の WHERE で絞る**。取ってからアプリで捨てない
 *    （`AGENTS.md §3.5`・通知の service と同じ考え方。フィルタを 1 行消すと漏れる形にしない）。
 *
 * @param viewer `scope: "mine"` のときの本人 ID。**クエリ文字列から取らないこと**
 */
export async function listBugReports({
  scope,
  viewer = null,
  status,
  limit = 50,
}: {
  scope: "mine" | "all";
  viewer?: string | null;
  status?: BugReportStatus;
  limit?: number;
}): Promise<BugReport[]> {
  const query = db("ohmycms_bug_reports")
    .select(...REPORT_COLUMNS)
    // 返信が来た順に上へ。まだ返信が無いものは報告された時刻で並ぶ。
    .orderByRaw("coalesce(last_message_at, created_at) desc")
    .limit(Math.min(Math.max(limit, 1), 200));

  if (scope === "mine") {
    // 🚨 本人が分からないなら**何も返さない**。ここを素通しにすると全件見えてしまう。
    if (!viewer) return [];
    query.where({ reporter: viewer });
  }
  if (status) query.where({ status });

  const rows = await query;
  return rows.map(presentReport);
}

/**
 * 1 件の報告と、そのやりとり。
 *
 * 🚨 **他人の報告は「無い」と同じ応答にする**（存在を漏らさない）。
 *    通知の `markRead` が他人の ID に 404 を返すのと同じ扱い。
 */
/**
 * 主キーは uuid なので、**その形でない id は DB へ渡さない**。
 *
 * 🚨 渡すと Postgres が `invalid input syntax for type uuid` を投げ、
 *    画面には「処理できませんでした。時間をおいてもう一度お試しください。」が出る。
 *    ＝ **利用者は「壊れている」と読む**が、実際は「その報告が無い」だけ。
 *
 * 実測（2026-08-17・pages）: J1 で `/admin/reports/manage` を消したあと、
 * その URL が `[id]` に吸われて **HTTP 200 ＋「処理できませんでした」**になっていた。
 * `/admin/reports/zz-not-an-id` も同じ。
 *
 * 🚨 **同じ形を schema が content 側で先に直している**（`d2a45e0`・`isPostgresUuidInput`）。
 *    ここは報告の主キーが必ず uuid なので、**その 1 種類だけを見る**（型を引く必要が無い）。
 */
function looksLikeUuid(value: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);
}

export async function getBugReportThread(
  id: string,
  { viewer, isManager }: { viewer: string | null; isManager: boolean },
): Promise<BugReportThread> {
  // 🚨 「無い」と「壊れた id」を同じ 404 にする。403 を作らないのと同じ考え方で、
  //    **その id の報告が在るかどうかを、形の違いで漏らさない**。
  if (!looksLikeUuid(id)) throw new ApiError(404, "NOT_FOUND", "報告が見つかりません");

  const query = db("ohmycms_bug_reports").select(...REPORT_COLUMNS).where({ id });
  // 管理者でないなら、**自分が出した報告だけ**。WHERE に入れる（取ってから捨てない）。
  if (!isManager) {
    if (!viewer) throw new ApiError(404, "NOT_FOUND", "報告が見つかりません");
    query.andWhere({ reporter: viewer });
  }

  const row = await query.first();
  if (!row) throw new ApiError(404, "NOT_FOUND", "報告が見つかりません");

  const [messages, attachments] = await Promise.all([
    db("ohmycms_bug_report_messages")
      .select("id", "report", "author", "body", "kind", "created_at")
      .where({ report: id })
      .orderBy("created_at", "asc"),
    listAttachments(id),
  ]);

  return { report: presentReport(row), attachments, messages: messages.map(presentMessage) };
}

/**
 * やりとりを 1 通足す。
 *
 * 堀池さん:「それ以降は**返信があったらお知らせに表示される**」
 * → 報告者が書いたら管理者へ、管理者が書いたら報告者へ通知する。
 *
 * 🚨 **自分の発言で自分に通知しない。** 相手が居ないとき（報告者が退会した等）は
 *    通知を作らないだけで、発言の保存は成功させる（通知は発言のおまけ）。
 */
export async function addBugReportMessage(
  reportId: string,
  {
    author,
    body,
    isManager,
  }: { author: string | null; body: unknown; isManager: boolean },
): Promise<BugReportMessage> {
  const text = typeof body === "string" ? body.trim() : "";
  if (!text) throw new ApiError(400, "INVALID_FIELD", "body を入力してください");
  if (text.length > MAX_BODY) {
    throw new ApiError(400, "INVALID_FIELD", `body は${MAX_BODY}文字までです`);
  }

  // 見られない報告へは書けない（読みの判定をそのまま使う）。
  const { report } = await getBugReportThread(reportId, { viewer: author, isManager });

  const message: BugReportMessage = {
    id: randomUUID(),
    report: reportId,
    author,
    body: text,
    kind: "message",
    created_at: new Date().toISOString(),
  };

  await db("ohmycms_bug_report_messages").insert({
    ...message,
    created_at: new Date(message.created_at),
  });
  await db("ohmycms_bug_reports")
    .where({ id: reportId })
    .update({ last_message_at: new Date(message.created_at) });

  // 管理者が返信したときだけ、報告者へ知らせる。
  // （報告者の発言で管理者全員へ配るのは、宛先を決める仕組みが要るので今は作らない。
  //   管理者は「報告管理」の一覧で未解決を見る。）
  if (isManager && report.reporter && report.reporter !== author) {
    await createNotification({
      recipient: report.reporter,
      messageKey: "message_bug_report_replied",
      params: { title: report.title },
      link: `/admin/reports/${reportId}`,
    });
  }

  return message;
}

/**
 * 解決済みにする／未解決へ戻す。
 *
 * 🚨 **状態の変化もチャットの行として残す**（`kind` が `resolved` / `reopened`）。
 *    別表にすると、画面で時系列に混ぜて出すときに 2 つを突き合わせることになる。
 * 🚨 変えられるのは**管理者だけ**。呼ぶ側で確かめること。
 */
export async function setBugReportStatus(
  reportId: string,
  status: BugReportStatus,
  { actor }: { actor: string | null },
): Promise<BugReport> {
  const { report } = await getBugReportThread(reportId, { viewer: actor, isManager: true });
  if (report.status === status) return report;

  const now = new Date();
  const resolved = status === "resolved";

  await db("ohmycms_bug_reports").where({ id: reportId }).update({
    status,
    resolved_at: resolved ? now : null,
    resolved_by: resolved ? actor : null,
    last_message_at: now,
  });

  await db("ohmycms_bug_report_messages").insert({
    id: randomUUID(),
    report: reportId,
    author: actor,
    // 🚨 文言は入れない。表示側が `kind` から辞書を引く（DB に日本語を置かない）。
    body: "",
    kind: resolved ? "resolved" : "reopened",
    created_at: now,
  });

  if (report.reporter && report.reporter !== actor) {
    await createNotification({
      recipient: report.reporter,
      messageKey: resolved ? "message_bug_report_resolved" : "message_bug_report_reopened",
      params: { title: report.title },
      link: `/admin/reports/${reportId}`,
    });
  }

  return {
    ...report,
    status,
    resolved_at: resolved ? now.toISOString() : null,
    resolved_by: resolved ? actor : null,
    last_message_at: now.toISOString(),
  };
}
