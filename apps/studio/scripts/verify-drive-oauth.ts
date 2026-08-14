/**
 * ドライブ連携の実測ハーネス（PKCE の計算と、secret を持たないこと）。
 *
 *   bun --filter @ohmycms/studio verify:drive
 *
 * 🚨 **ここで測れないこと（unverified）**: Google との**往復**。鍵が無いので叩いていない。
 *    「PKCE の往復を1回通す」「わざと間違えた code_verifier で失敗する」は、
 *    **クライアントが用意できてから**実測に格上げする。ここで測るのは:
 *      ・PKCE の**計算が RFC 7636 のとおりか**（challenge が verifier の S256 か）
 *      ・🚨 **間違った verifier では challenge が一致しない**（照合が意味を持つこと）
 *      ・🚨 **ドライブ経路に `client_secret` が 1 件も無い**こと
 *      ・認可 URL に載る値（secret が混ざっていないこと・S256 であること）
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../lib/db/knex";
import { connectionStatus, disconnect, saveConnection } from "../lib/drive/tokens";
import { authorizationUrl, createPkcePair, DRIVE_SCOPE } from "../lib/drive/oauth";

let failures = 0;
function check(label: string, ok: boolean, detail: string): void {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  ${detail}`);
}

/** ドライブ経路のファイルを列挙する（ログイン用の経路は含めない）。 */
async function driveFiles(): Promise<string[]> {
  const roots = ["lib/drive", "app/api/drive"];
  const found: string[] = [];
  for (const root of roots) {
    const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
      found.push(path.join(entry.parentPath ?? root, entry.name));
    }
  }
  return found;
}

/**
 * リフレッシュトークンの保管。
 * 🚨 **DB に平文が入っていないこと**を、暗号文そのものを見て確かめる。
 *    「暗号化しているつもり」は、保存された値を見るまで確かめたことにならない。
 * 🚨 検証用の鍵は**この実行の中だけ**で作る（`.env` に書かない）。
 */
async function tokenStorageChecks(): Promise<void> {
  if (!process.env.OHMYCMS_SECRET_KEY) {
    console.log("   OHMYCMS_SECRET_KEY が無いので、トークンの保管は測っていない（unverified）");
    return;
  }
  const user = await db("directus_users").select("id").first().catch(() => null);
  if (!user) {
    console.log("   利用者がいないので、トークンの保管は測っていない（unverified）");
    return;
  }

  const secret = "1//verify-refresh-token-DO-NOT-LOG";
  await saveConnection(user.id, {
    refreshToken: secret,
    scope: DRIVE_SCOPE,
    accountEmail: "someone@example.com",
  });

  const raw = await db("ohmycms_drive_tokens").where({ user_id: user.id }).first();
  check(
    "🚨 保管: DB に平文が入っていない",
    Boolean(raw) && !String(raw.refresh_token).includes(secret),
    `先頭 ${String(raw?.refresh_token).slice(0, 3)}…（${String(raw?.refresh_token).length}文字）`,
  );
  check(
    "保管: secret-box の形式で入っている",
    String(raw?.refresh_token).startsWith("v1:"),
    String(raw?.refresh_token).slice(0, 3),
  );

  const status = await connectionStatus(user.id);
  check(
    "🚨 保管: 画面へ返す形にトークンが混ざっていない",
    !JSON.stringify(status).includes(secret),
    JSON.stringify(status),
  );

  // 繋ぎ直しで古いトークンが残らないこと。
  await saveConnection(user.id, {
    refreshToken: `${secret}-2`,
    scope: DRIVE_SCOPE,
    accountEmail: "other@example.com",
  });
  const rows = await db("ohmycms_drive_tokens").where({ user_id: user.id });
  check("保管: 繋ぎ直しても行が増えない（上書き）", rows.length === 1, `${rows.length} 行`);

  await disconnect(user.id);
  const left = await db("ohmycms_drive_tokens").where({ user_id: user.id });
  check("保管: 解除で行が消える", left.length === 0, `${left.length} 行`);
  await db.destroy();
}

async function main(): Promise<void> {
  // 1. PKCE の計算が RFC 7636 のとおりか。
  const pair = createPkcePair();
  const recomputed = createHash("sha256").update(pair.codeVerifier).digest("base64url");
  check(
    "PKCE: challenge は verifier の SHA-256(base64url)",
    pair.codeChallenge === recomputed,
    `${pair.codeChallenge.slice(0, 12)}… (${pair.codeChallenge.length}文字)`,
  );
  check(
    "PKCE: verifier は 43〜128 文字",
    pair.codeVerifier.length >= 43 && pair.codeVerifier.length <= 128,
    `${pair.codeVerifier.length} 文字`,
  );
  check(
    "PKCE: verifier に使ってよい文字だけ",
    /^[A-Za-z0-9\-._~]+$/.test(pair.codeVerifier),
    "unreserved のみ",
  );

  // 2. 🚨 **間違った verifier では一致しない**（照合が意味を持つことの確認）。
  //    ここが一致してしまうと、往復が通っても「検証が効いている」とは言えない。
  const wrong = createHash("sha256").update(`${pair.codeVerifier}x`).digest("base64url");
  check(
    "PKCE: 1文字違う verifier では challenge が一致しない",
    wrong !== pair.codeChallenge,
    "不一致",
  );

  // 3. 毎回違う値が出るか（固定値を返していないこと）。
  const another = createPkcePair();
  check(
    "PKCE: 呼ぶたびに違う値になる",
    another.codeVerifier !== pair.codeVerifier,
    "2回とも別の値",
  );

  // 4. 認可 URL の中身。
  const url = new URL(
    authorizationUrl({
      clientId: "test-client-id.apps.googleusercontent.com",
      redirectUri: "http://localhost:3102/api/drive/callback",
      codeChallenge: pair.codeChallenge,
      state: "test-state",
    }),
  );
  check(
    "認可URL: S256 を指定している",
    url.searchParams.get("code_challenge_method") === "S256",
    String(url.searchParams.get("code_challenge_method")),
  );
  check(
    "認可URL: refresh_token を受け取る指定がある",
    url.searchParams.get("access_type") === "offline",
    String(url.searchParams.get("access_type")),
  );
  check(
    "認可URL: 読み取りだけを求めている",
    url.searchParams.get("scope") === DRIVE_SCOPE && DRIVE_SCOPE.endsWith("drive.readonly"),
    String(url.searchParams.get("scope")),
  );
  check(
    "🚨 認可URL: verifier そのものが載っていない",
    !url.toString().includes(pair.codeVerifier),
    "載っていない",
  );
  check(
    "🚨 認可URL: client_secret を載せていない",
    !url.searchParams.has("client_secret"),
    "無し",
  );

  // 5. 🚨 **ドライブ経路に client_secret が 1 件も無い**こと。
  //    探し方: lib/drive と app/api/drive だけを見る。
  //    ログイン用の `google_client_secret`（lib/auth/google.ts）は**別経路なので数えない**。
  const files = await driveFiles();
  const hits: string[] = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (source.includes("client_secret")) hits.push(file);
  }
  check(
    "🚨 ドライブ経路に client_secret が無い",
    hits.length === 0,
    `${files.length} ファイルを検査 / 該当 ${hits.length} 件${hits.length ? `: ${hits.join(", ")}` : ""}`,
  );
  // 🚨 「0 件」が「見ていない 0」でないことを示す。検査対象が実在しているか。
  check(
    "🚨 検査対象を実際に拾えている（0件の意味を確かめる）",
    files.length > 0,
    files.join(", "),
  );

  // 6. トークンの保管。🚨 **平文が DB に入らないこと**が本丸。
  await tokenStorageChecks();

  console.log(
    failures === 0
      ? "\nすべて通りました\n🚨 Google との往復は未検証（unverified）。クライアントが用意できてから測る。"
      : `\n落ちた項目: ${failures}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

await main();
