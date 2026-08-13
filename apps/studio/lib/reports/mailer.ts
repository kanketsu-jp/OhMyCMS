/**
 * 不具合報告のメール送信（F2 §2-G）。
 *
 * 🚨 ここは**送れなくても良い**モジュール。呼び出し側（service.ts）は
 *    失敗しても報告の保存を成功として扱う。だからここで例外を投げてよいが、
 *    **例外の中身に SMTP の設定値を混ぜてはいけない**（司令塔の条件3）。
 *    nodemailer のエラーには接続先やユーザー名が入ることがあるので、
 *    service.ts の redactMailError() が伏せてから DB へ入れる。
 *    このモジュール自身は**ログを一切出さない**（console.log に設定が出る事故を根から断つ）。
 *
 * 契約 §2-2: `next/*` を import しない。
 */

import nodemailer, { type Transporter } from "nodemailer";

import type { MailConfig, MailSender } from "./service";

/**
 * 同じ設定なら transporter を使い回す（接続を毎回張り直さない）。
 * キーに**パスワードを含めない**のは、万一この Map が dump されても
 * 秘密が出ないようにするため。host/port/user が同じなら同一とみなす。
 */
const transporters = new Map<string, Transporter>();

function transporterFor(config: MailConfig): Transporter {
  const key = `${config.host}:${config.port}:${config.user}:${config.secure}`;
  const existing = transporters.get(key);
  if (existing) return existing;

  const created = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    // 465 は接続直後から TLS、587 は STARTTLS（nodemailer が自動で昇格する）。
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    // 管理画面のフォームが固まらないよう短く切る。送信の成否は本体に影響しない。
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
 * 実際に送る。service.ts の setMailSender() へ渡す。
 * 🚨 本文は呼び出し側が組み立てる（何を書くかの判断をここに散らさない）。
 */
export const sendBugReportMail: MailSender = async (config, mail) => {
  await transporterFor(config).sendMail({
    from: config.from,
    to: config.to,
    subject: mail.subject,
    text: mail.text,
  });
};
