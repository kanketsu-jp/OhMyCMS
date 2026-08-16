/**
 * 受入基準3（MVP ⑤）: **GUI で全ての機能にアクセス・管理できる**
 *
 * 🚨 この基準は**半分しか機械化できない**。正直に分ける:
 *
 *   機械で言えること   … 「**到達できる**」。ナビから全機能へのリンクが生きていて、
 *                        ログインすれば 200 が返り、未ログインなら弾かれる
 *   人でしか言えないこと … 「**操作できる**」。実際に描画されるか、ボタンを押すと動くか、
 *                        画像がプレビューされるか
 *
 * **「HTML に <button> がある」は「押すと動く」ではない。** onClick が繋がっているかは
 * HTML からは分からないので、そこは manual-3.md で人が見る。
 * このチェックが PASS でも、**操作の確認は別途要る**（判定の details にも出す）。
 *
 * なぜ到達だけでも機械化する価値があるか:
 *   F6 のようにデザインを刷新すると、**画面は綺麗になったのに設定への導線が消える**事故が起きうる。
 *   リンクが消えればこのチェックが落ちるので、書き換えに耐える。
 *
 * 前提: 管理画面は SSR で HTML に中身まで来ている（実測）。だからリンク抽出が成立する。
 * 🚨 ただし**コレクション配下（フィールド・コンテンツ）は HTML にリンクが出ない**
 *   （一覧が client 側で組まれるため）。そこは**実際にコレクションを作って URL で叩く**。
 */

import { Session } from "../lib/http.mjs";
import { establishSession } from "../lib/session.mjs";
import { assertion, result, statusFromAssertions, STATUS } from "../lib/result.mjs";

const PREFIX = "acc_reach_";

/**
 * MVP ⑤ が「全ての機能」と言っている中身の名簿。
 * 🚨 **ナビから消えたら落とす。** F6 で画面を書き換えても、ここに挙げた機能へ
 *   辿り着けなくなったら受入は通さない。
 */
const REQUIRED_NAV = [
  ["/admin/collections", "コレクション"],
  ["/admin/files", "ファイル"],
  ["/admin/folders", "フォルダ"],
  ["/admin/settings/roles", "ロール"],
  ["/admin/settings/policies", "ポリシー（権限）"],
  ["/admin/settings/users", "ユーザー"],
  ["/admin/settings/agents", "エージェントトークン"],
];

/**
 * 🚨 **200 は「開けた」の証拠にならない。**
 * 中身が空でも 200 は返る。今日だけで「判定基準そのものが間違っていた」事故が9件出ている
 * （knowledge/decisions/verify-the-verifier.md）。**判定の前に、判定が事実を写すかを確かめる。**
 * ここでは「見出しが出ている」「ナビが3本以上ある」を最低条件にしている。
 *
 * 🚨 それでも**このチェックはレイアウトを見ていない**。
 *   幅が 0 でも、CSS が全部落ちても、HTML に見出しがあれば通る。
 *   **「#3 が PASS」は「画面が正しく見える」ではない。** そこは人が manual-3.md で見る。
 */

/** 人がブラウザで見るしかない残り。details に必ず出して、忘れられないようにする */
const MANUAL_RESIDUE = [
  "実際に描画されるか（崩れ・重なり・ダーク/ライト）",
  "ボタンを押すとフォームが送信されるか（HTML に <button> があっても onClick が繋がっているかは分からない）",
  "画像がプレビューされるか / SVG がダウンロード扱いになるか（ブラウザ上の挙動）",
];

function blocked(reason, details, repro, started) {
  return result({
    id: 3,
    title: "GUI から全機能へ到達できる（操作の確認は manual-3.md）",
    status: STATUS.BLOCKED,
    reason,
    details,
    repro,
    ms: Date.now() - started,
  });
}

export async function check(context) {
  const started = Date.now();
  const { baseUrl } = context;
  const assertions = [];
  const details = [];
  const stamp = Date.now();
  const collection = `${PREFIX}${stamp}`;

  // 🚨 --red 3: 「存在しない機能」を名簿へ足して、**名簿の検査が本当に効くか**を見る。
  //   名簿が素通りしていたら、F6 で導線が消えても気づけない。
  const sabotage = context.red?.includes(3) ?? false;
  const roster = sabotage
    ? [...REQUIRED_NAV, ["/admin/settings/nonexistent", "存在しない機能（--red 用）"]]
    : REQUIRED_NAV;

  // 開発ビルドなら dev-login、本番ビルドなら .env の管理者でパスワードログイン
  // 🚨 label に stamp を入れない。dev-login は email ごとに directus_users の行を作るので、
  //   毎回違う email にすると走らせるたびに利用者が 1 人増える（実測 2026-08-17: dev の利用者 308 人中
  //   266 人が acc- 接頭辞＝受入の残骸だった）。同じ email なら upsertDevUser が既存行を再利用する
  //   （insert しない・ensureDevAdminAccess も冪等）ので、固定にして「消すものを作らない」形にする。
  //   コレクション名・トークン名の stamp は後始末が在るのでそのまま残す。
  const auth = await establishSession(baseUrl, { label: "reach", admin: true });
  if (!auth.ok) {
    return blocked(auth.reason, auth.detail, [`bun run acceptance --only 3 --base-url ${baseUrl}`], started);
  }
  const admin = auth.session;
  details.push(`ログイン方式: ${auth.method}`);

  // ── 🚨 オンボーディング未完了なら「判定不能」。**FAIL にしない** ──
  //   /admin が /onboarding へ飛ぶのは**正しい挙動**（初期設定が済んでいないだけ）。
  //   これを FAIL にすると「アプリが壊れている」と誤読させる。
  //   壊れているのか、まだ設定していないのかは**別のこと**（BLOCKED と FAIL の区別）。
  const preflight = await admin.get("/admin");
  const onboardingRedirect =
    (preflight.status === 307 || preflight.status === 302) &&
    (preflight.headers.get("location") ?? "").includes("/onboarding");
  if (onboardingRedirect) {
    return blocked(
      "オンボーディングが未完了です（/admin → /onboarding）",
      [
        "**アプリは壊れていません。** 初期設定が済んでいないので、管理画面へ入れないのが正しい挙動です。",
        "受入基準3 は「ログインした人が全機能へ到達できるか」を見るので、この状態では判定できません。",
        "",
        "判定するには、対象で初期設定を済ませてください（環境変数の管理者 → /onboarding）。",
        "🚨 **共有 DB の単一行（ohmycms_settings）なので、済ませると他の対象にも効きます。**",
        "  堀池さんに初期設定を体験してもらう予定があるなら、**先に確認してから**済ませること。",
      ],
      [`curl -sS -o /dev/null -w '%{http_code}' ${baseUrl}/onboarding`],
      started,
    );
  }

  // ── 肯定形1: ナビに必須機能が揃っていて、全部 200 で開ける ──
  // 🚨 **`/admin` が 200 とは限らない。**
  //   実測（2026-08-14）: ログイン済みだと `/admin` → **307 `/admin/collections`**。
  //   トップに置く画面が決まったための設計変更で、**退行ではない**。
  //   だが「200 でなければ FAIL」と書いていたので、**製品でなく検査が落ちた**。
  //   → **管理画面の中へ飛ぶ 307 は追う。** `/login` や `/onboarding` へ飛ぶのは別の話
  //     （前者は未ログイン、後者は初期設定前。どちらも上で別に判定している）。
  const followAdminRedirect = async (response) => {
    if (response.status !== 307 && response.status !== 308) return response;
    const location = response.headers.get("location") ?? "";
    if (!location.startsWith("/admin")) return response;
    return admin.get(location);
  };
  const shell = await followAdminRedirect(
    preflight.status === 200 ? preflight : await admin.get("/admin"),
  );
  // 🚨 **素の `href="..."` だけを見ない。**
  //   設定系（ロール / ポリシー / ユーザー / エージェントトークン）は**クライアント描画**に
  //   変わり、サーバ HTML には RSC のペイロード内に
  //   `\"href\":\"/admin/settings/roles\"` の形（JSON をエスケープしたもの）でしか出ない。
  //   素の href だけ見ていたので **13 本 → 7 本に見え、FAIL を出した**（2026-08-14）。
  //   実際にはページは 200 で開け、ブラウザからは出ている。**製品でなく抽出が脆かった。**
  //   → 両方の形を拾う。ここで拾えるのは「導線が提供されているか」までで、
  //     **実際に押せるか**は人が見る（manual-3.md）。
  const hrefs = [
    ...new Set(
      [
        ...[...shell.text.matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1]),
        ...[...shell.text.matchAll(/\\"href\\":\\"(\/[^"\\#?]*)\\"/g)].map((m) => m[1]),
      ].filter((h) => !h.startsWith("/_next")),
    ),
  ];
  assertions.push(
    assertion("positive", "管理画面の入口が開ける", shell.status === 200, `HTTP ${shell.status}`, "200"),
  );

  const missing = roster.filter(([path]) => !hrefs.includes(path)).map(([, name]) => name);
  assertions.push(
    assertion(
      "positive",
      "必須機能への導線がナビに揃っている",
      missing.length === 0,
      missing.length === 0 ? `${roster.length}/${roster.length} あり` : `欠け: ${missing.join(" / ")}`,
      "全部ある",
    ),
  );

  const broken = [];
  const empty = [];
  for (const href of hrefs) {
    // 管理画面の中へ飛ぶ 307 は「到達できる」として扱う（上と同じ理由）
    const page = await followAdminRedirect(await admin.get(href));
    if (page.status !== 200) {
      broken.push(`${href}=${page.status}`);
      continue;
    }
    // 🚨 **200 を「開けた」の証拠にしない。**
    //   500 を返さずに中身が空、という壊れ方がある（今日の「判定基準そのものが間違っている」の系統）。
    //   見出しとナビが両方あって初めて「その画面が組み上がっている」と言える。
    const hasHeading = /<h1[^>]*>\s*\S/.test(page.text);
    const hasNav = (page.text.match(/href="\/admin[^"]*"/g) ?? []).length >= 3;
    if (!hasHeading || !hasNav) {
      empty.push(`${href}(${hasHeading ? "" : "見出し無し"}${hasNav ? "" : " ナビ無し"})`);
    }
  }
  assertions.push(
    assertion(
      "positive",
      `ナビから辿れる画面が全部開ける（${hrefs.length} 本）`,
      broken.length === 0,
      broken.length === 0 ? `${hrefs.length} 本すべて 200` : `開けない: ${broken.join(" ")}`,
      "全部 200",
    ),
  );
  assertions.push(
    assertion(
      "positive",
      "開いた画面が空でない（見出しとナビが出ている）",
      empty.length === 0,
      empty.length === 0 ? `${hrefs.length} 本すべて中身あり` : `空: ${empty.join(" ")}`,
      "全部中身あり",
    ),
  );

  // ── 肯定形2: コレクションを作ると、その配下の画面へ到達できる ──
  //    🚨 ここは HTML にリンクが出ないので URL で叩く（一覧が client 側で組まれるため）
  let created = false;
  const asAdmin = (path, body, method = "POST") =>
    admin.request(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const collectionCreated = await asAdmin("/api/collections", {
    collection,
    fields: [
      { field: "id", type: "uuid", schema: { is_primary_key: true } },
      { field: "title", type: "string" },
    ],
  });
  created = collectionCreated.status === 200;

  try {
    let itemId = null;
    if (created) {
      const seeded = await asAdmin(`/api/items/${collection}`, { title: "到達確認" });
      itemId = seeded.json?.data?.id ?? null;
    }

    const perCollection = [
      [`/admin/collections/${collection}`, "フィールドの画面"],
      [`/admin/content/${collection}`, "アイテム一覧"],
      [`/admin/content/${collection}/new`, "アイテムの新規作成"],
      ...(itemId ? [[`/admin/content/${collection}/${itemId}`, "アイテムの編集"]] : []),
    ];
    const unreachable = [];
    for (const [path, label] of perCollection) {
      const page = await admin.get(path);
      if (page.status !== 200) unreachable.push(`${label}=${page.status}`);
    }
    assertions.push(
      assertion(
        "positive",
        "作ったコレクションの配下（フィールド・アイテム）へ到達できる",
        created && unreachable.length === 0,
        created
          ? unreachable.length === 0
            ? `${perCollection.length} 画面すべて 200`
            : `開けない: ${unreachable.join(" ")}`
          : `コレクションを作れず未確認 (HTTP ${collectionCreated.status})`,
        "全部 200",
      ),
    );

    // ── 🚨 肯定形: **作ったコレクションに、実際にアイテムを1件作れる** ──
    //   「画面が 200 で開ける」だけでは**使えるとは言えない**。実際に
    //   「GUI でコレクションを作る → そこにアイテムを作る」が通らないと機能していない。
    //   実際に穴があった: **GUI で作ったコレクションは id に default が無く、
    //   アイテムを1行も作れず 500 になっていた**（base2 が修正・1e8283f）。
    //   → 画面の到達だけを見ていると、この形の壊れ方を**丸ごと見逃す**。
    if (created) {
      const added = await asAdmin(`/api/items/${collection}`, { title: "アイテム作成の確認" });
      const listed = await admin.get(`/api/items/${collection}`);
      const rows = Array.isArray(listed.json?.data) ? listed.json.data.length : -1;
      assertions.push(
        assertion(
          "positive",
          "作ったコレクションにアイテムを作れる（id が自動で入る）",
          (added.status === 200 || added.status === 201) && rows >= 1,
          `作成 HTTP ${added.status} / 一覧 ${rows} 件`,
          "200/201 かつ 1 件以上",
        ),
      );
    }

    // ── 否定形: 未ログインでは弾かれる ──
    //    🚨 肯定形（ログインすれば開ける）とセットで見る。
    //      「全部弾かれる」だけなら、単に画面が壊れていても通ってしまう。
    const anon = new Session(baseUrl, "anon");
    const anonShell = await anon.get("/admin/collections");
    assertions.push(
      assertion(
        "negative",
        "未ログインでは管理画面へ入れない（/login へ飛ぶ）",
        anonShell.status === 307 || anonShell.status === 302,
        `HTTP ${anonShell.status} → ${anonShell.headers.get("location") ?? "-"}`,
        "307 か 302",
      ),
    );
    const anonContent = created ? await anon.get(`/admin/content/${collection}`) : null;
    assertions.push(
      assertion(
        "negative",
        "未ログインではコレクション配下にも入れない",
        anonContent ? anonContent.status === 307 || anonContent.status === 302 : false,
        anonContent ? `HTTP ${anonContent.status}` : "未確認",
        "307 か 302",
      ),
    );

    if (sabotage) {
      details.push(
        "⚠ --red 3 が指定されているため、存在しない機能を名簿へ足しています（FAIL になるのが正しい結果です）。",
      );
    }
    details.push(
      `ナビから ${hrefs.length} 本のリンクを抽出し、全部叩いた（必須 ${roster.length} 機能を含む）`,
      "🚨 **このチェックが見ているのは「到達できる」までです。** 次の3点は人がブラウザで見てください:",
      ...MANUAL_RESIDUE.map((line, i) => `   ${i + 1}. ${line}`),
      "   手順書: acceptance/manual-3.md",
    );
  } finally {
    if (created) {
      await admin.request(`/api/collections/${collection}`, { method: "DELETE" }).catch(() => {});
    }
  }

  const verdict = statusFromAssertions(assertions);
  return result({
    id: 3,
    title: "GUI から全機能へ到達できる（操作の確認は manual-3.md）",
    status: verdict.status,
    positive: `ナビ ${hrefs.length} 本 + コレクション配下が 200`,
    negative: "未ログインは /login へ",
    details: [...details, ...verdict.details],
    repro: [`bun run acceptance --only 3 --base-url ${baseUrl}`],
    assertions,
    ms: Date.now() - started,
  });
}
