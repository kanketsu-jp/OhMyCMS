/**
 * OTP（ワンタイムコード）のメール送信。
 *
 * 🚨 lib/reports/mailer.ts と同じ作り（transporterのキャッシュ・logger/debug無効化・
 *    タイムアウトを短く切る）だが、lib/reports/** は他トラックの担当なので書き換えず、
 *    あえて別ファイルに複製している。設定の読み方（mailConfig）だけは共有する。
 *    将来的に1つの送信基盤へまとめる候補（いまは重複を許容する）。
 *
 * 契約 §2-2: next/* を import しない。
 */

import nodemailer, { type Transporter } from "nodemailer";
import type { MailConfig } from "@/lib/reports/service";

/**
 * 同じ設定なら transporter を使い回す。キーに**パスワードを含めない**
 * （万一この Map が dump されても秘密が出ないように）。
 */
const transporters = new Map<string, Transporter>();

function transporterFor(config: MailConfig): Transporter {
  const key = `${config.host}:${config.port}:${config.user}:${config.secure}`;
  const existing = transporters.get(key);
  if (existing) return existing;

  const created = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    // 🚨 nodemailer のデバッグ出力には認証情報が載る。絶対に有効化しない。
    logger: false,
    debug: false,
  });

  transporters.set(key, created);
  return created;
}

/**
 * 確認コードを送る。
 * 🚨 MailConfig.to は不具合報告の宛先なので使わない（宛先は利用者のメール = to 引数）。
 * 🚨 本文にコード以外の秘密を入れない（利用者名・IDなどを入れない）。
 * このモジュールはログを一切出さない。
 */
export async function sendLoginCodeMail(
  config: MailConfig,
  to: string,
  code: string,
): Promise<void> {
  await transporterFor(config).sendMail({
    from: config.from,
    to,
    subject: "ログイン確認コード",
    text: `確認コード: ${code}\n\nこのコードは10分間有効です。心当たりが無い場合はこのメールは無視してください。`,
  });
}
