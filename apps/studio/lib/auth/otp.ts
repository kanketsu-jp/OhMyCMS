import { randomInt, randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { sendLoginCodeMail } from "@/lib/auth/otp-mailer";
import { db } from "@/lib/db/knex";
import { mailConfig } from "@/lib/reports/service";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_INTERVAL_MS = 60 * 1000;
const MAX_PER_HOUR = 5;

type LoginCodeRow = {
  id: string;
  email: string;
  code_hash: string;
  expires_at: Date | string;
  attempts: number;
  consumed_at: Date | string | null;
  created_at: Date | string;
};

let dummyHash: Promise<string> | null = null;

function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomUUID());
  return dummyHash;
}

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * 確認コードを発行してメールへ送る。
 *
 * 🚨 例外を投げるのは「送信そのものに失敗したとき」だけ（呼び出し側が失敗を画面へ返す）。
 *    それ以外（上限超過・アカウント不存在）は例外を投げず、静かに戻る
 *    （呼び出し側は常に同じ200を返すため。存在の有無・上限超過を区別させない）。
 */
export async function requestLoginCode(email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  const now = new Date();

  // ── 送信要求の上限（同一宛先へ 60秒に1通 / 1時間に5通）──
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const recent = await db<LoginCodeRow>("ohmycms_login_codes")
    .select("created_at")
    .where({ email: normalized })
    .andWhere("created_at", ">", oneHourAgo)
    .orderBy("created_at", "desc");

  if (recent.length >= MAX_PER_HOUR) {
    return;
  }
  const last = recent[0];
  if (last && now.getTime() - new Date(last.created_at).getTime() < RESEND_INTERVAL_MS) {
    return;
  }

  // ── アカウントの存在確認 ──
  const user = await db("directus_users")
    .select("id")
    .where({ email: normalized, status: "active" })
    .first();

  if (!user) {
    // 🚨 居なくても、居るときと同じだけの処理（scryptハッシュ1回）をして時間を揃える。
    //    DBには書かない・メールも送らない。
    await hashPassword(generateCode());
    return;
  }

  // ── コードを発行 ──
  const code = generateCode();
  const codeHash = await hashPassword(code);
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);

  await db.transaction(async (trx) => {
    // 同じメールの未使用コードは消費済みにする（同時に複数生かさない）。
    await trx("ohmycms_login_codes")
      .where({ email: normalized })
      .whereNull("consumed_at")
      .update({ consumed_at: now });

    await trx("ohmycms_login_codes").insert({
      id: randomUUID(),
      email: normalized,
      code_hash: codeHash,
      expires_at: expiresAt,
      attempts: 0,
      consumed_at: null,
      created_at: now,
    });
  });

  // ── メールを送る。🚨 **待たない。失敗も呼び出し側へ返さない。** ──
  //
  // 待つと「そのアドレスが登録されているか」が漏れる。理由は2つあり、どちらも実測・設計で確認した:
  //   ① **時間**: 登録されている人にだけ SMTP 接続が入るので、応答が明らかに遅くなる
  //   ② **状態**: 送信失敗で 500 を返すと、**そもそも送らない未登録の宛先では 500 が起きない**。
  //      つまり **500 が「そのアドレスは存在する」ことの証明**になってしまう
  // どちらも「登録の有無を隠す」という目的を、こちら側から壊していた。
  //
  // 🚨 送れなくても利用者は閉じ込められない。**同じ画面にパスワードの入口が残っている**
  //    （decisions/auth-methods.md の「上が使えないとき下へ落ちる」）。
  // 送信できたかどうかは、運用者がサーバのログで見る（値は出さない）。
  const config = await mailConfig();
  if (!config) return;

  void sendLoginCodeMail(config, normalized, code).catch(() => {
    // 🚨 元のエラーには SMTP の接続先やユーザー名が入る。中身は出さない。
    console.error("[otp] 確認コードのメール送信に失敗しました");
  });
}

/**
 * コードを照合する。成功したら { userId }、失敗したら null を返す。
 * 🚨 コード・ハッシュ・メールをログに出さない。
 */
export async function verifyLoginCode(
  email: string,
  code: string,
): Promise<{ userId: string } | null> {
  const normalized = normalizeEmail(email);
  const now = new Date();

  // 🚨 **照合の前に「試す権利」を原子的に取る。**
  //    scrypt の照合は約 106ms かかる。「読む → 照合 → 更新」だと、**その間に別の要求が同じ行を読めます**。
  //    並行で投げると「**同じコードが2回通る**」「**上限を超えて試せる**」が起きる
  //    （security の攻撃演習で確定・2026-08-13）。
  //    ハッシュは scrypt なので **SQL では比較できません**。だから
  //      ① 先に attempts を1つ進めて行を確保する（上限の判定も同じ1文の中で）
  //      ② 照合する
  //      ③ 成功したときだけ consumed_at を立てる（この UPDATE も `consumed_at is null` で守る）
  //    ①と③がどちらも単一の UPDATE なので、並行しても **成功は最大1本**・**attempts は単調**になる。
  //    🚨 `skip locked` は使わない。素通りした要求が attempts を増やさないので、
  //       **並行で投げると「5回で止める」が働かなくなる**（実測: 10本投げて attempts=1）。
  //       待たせる（`for update`）ことで、1本ずつ確実に数える。
  const claimed = await db.raw(
    `update ohmycms_login_codes
        set attempts = attempts + 1
      where id = (
        select id from ohmycms_login_codes
         where email = ? and consumed_at is null and expires_at > ?
         order by created_at desc
         limit 1
         for update
      )
        and attempts < ?
      returning id, code_hash`,
    [normalized, now, MAX_ATTEMPTS],
  );
  const row = (claimed as { rows: { id: string; code_hash: string }[] }).rows[0];

  if (!row) {
    // 該当なし / 期限切れ / 上限に達している / 他の要求が握っている。
    // 🚨 どれも同じ扱い（理由を外へ出さない）。時間を揃えるためダミーの照合を1回走らせる。
    await verifyPassword(code, await getDummyHash());
    return null;
  }

  const matches = await verifyPassword(code, row.code_hash);
  if (!matches) {
    // attempts は既に進めてある（上の①）。ここでは何も書かない。
    return null;
  }

  // 🚨 正解でも「消費できた1本」だけが勝つ。同時に正解を投げても、2本目はここで 0 行になる。
  const consumed = await db.raw(
    `update ohmycms_login_codes
        set consumed_at = ?
      where id = ? and consumed_at is null
      returning id`,
    [now, row.id],
  );
  if ((consumed as { rows: { id: string }[] }).rows.length !== 1) return null;

  const user = await db("directus_users")
    .select("id")
    .where({ email: normalized, status: "active" })
    .first();
  if (!user) return null;

  return { userId: user.id };
}
