/**
 * 出力の整形。人が読む表と、CI から使う --json の2種類。
 *
 * 🚨 秘密を出力しない（F9h §2-4）。トークンやパスワードは長さだけ出す。
 * このモジュールを通さずに console.log しないこと。
 */

import { STATUS } from "./result.mjs";

/** 全角を2文字幅として数え、表の桁を揃える。 */
function width(text) {
  let n = 0;
  for (const ch of text) {
    n += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/.test(ch)
      ? 2
      : 1;
  }
  return n;
}

function pad(text, target) {
  const gap = target - width(text);
  return text + " ".repeat(gap > 0 ? gap : 0);
}

/**
 * 値に秘密が混ざらないようにする。
 * トークン・cookie・鍵は「長さだけ」に置き換える。
 */
export function redact(value) {
  if (value == null) return value;
  let text = String(value);
  // JWT っぽいもの
  text = text.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, (m) => `<token ${m.length}文字>`);
  // Set-Cookie / cookie ヘッダの値
  text = text.replace(/((?:set-)?cookie\s*[:=]\s*)([^\s;,]+)/gi, (_, head, val) => `${head}<cookie ${val.length}文字>`);
  // 明らかな秘密キー
  text = text.replace(
    /\b(AUTH_SECRET|GOOGLE_CLIENT_SECRET|R2_SECRET_ACCESS_KEY|POSTGRES_PASSWORD|password)\b(\s*[:=]\s*)(\S+)/gi,
    (_, key, sep, val) => `${key}${sep}<${val.length}文字>`,
  );
  // postgres://user:password@host
  text = text.replace(/(postgres(?:ql)?:\/\/[^:/@\s]+:)([^@\s]+)(@)/gi, (_, head, val, tail) => `${head}<${val.length}文字>${tail}`);
  return text;
}

const MARK = {
  [STATUS.PASS]: "PASS",
  [STATUS.FAIL]: "FAIL",
  [STATUS.SKIP]: "SKIP",
  [STATUS.BLOCKED]: "BLOCKED",
  [STATUS.MANUAL]: "MANUAL",
};

export function renderTable(results, meta) {
  const lines = [];
  lines.push("");
  lines.push(
    `━━ OhMyCMS v0.9 受入ハーネス ━━  ${meta.startedAt}  HEAD=${meta.head}  対象=${meta.baseUrl ?? "-"}` +
      // 🚨 どの環境に対する結果かをヘッダへ必ず出す。dev と本番で結果が変わる項目があるため
      `  [${meta.buildKind === "dev" ? "開発ビルド" : meta.buildKind === "production" ? "本番ビルド" : "到達不可"}]`,
  );
  lines.push("");

  const titleWidth = Math.max(...results.map((r) => width(r.title)), 30);
  const posWidth = Math.max(
    ...results.map((r) => width(redact(r.positive))),
    width("肯定形"),
  );
  const negWidth = Math.max(
    ...results.map((r) => width(redact(r.negative))),
    width("否定形"),
  );

  lines.push(
    ` #  ${pad("項目", titleWidth)}  ${pad("肯定形", posWidth)}  ${pad("否定形", negWidth)}  判定`,
  );
  lines.push(` ${"─".repeat(titleWidth + posWidth + negWidth + 14)}`);

  for (const r of results) {
    lines.push(
      ` ${String(r.id).padStart(1)}  ${pad(r.title, titleWidth)}  ` +
        `${pad(redact(r.positive), posWidth)}  ${pad(redact(r.negative), negWidth)}  ${MARK[r.status]}` +
        (r.reason ? `（${redact(r.reason)}）` : ""),
    );
  }

  lines.push("");

  // FAIL / BLOCKED の詳細と再現コマンド
  const needsDetail = results.filter(
    (r) => r.status === STATUS.FAIL || r.status === STATUS.BLOCKED,
  );
  for (const r of needsDetail) {
    lines.push(`── #${r.id} ${r.title} — ${MARK[r.status]} ──`);
    for (const d of r.details) lines.push(`   ${redact(d)}`);
    if (r.repro.length > 0) {
      lines.push("   再現:");
      for (const c of r.repro) lines.push(`     ${redact(c)}`);
    }
    lines.push("");
  }

  const counts = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(MARK)
    .filter(([key]) => counts[key])
    .map(([key, label]) => `${counts[key]} ${label}`)
    .join(" / ");

  const achieved = results.every((r) => r.status === STATUS.PASS);
  lines.push(`結果: ${summary}  → ${achieved ? "達成 (exit 0)" : "未達 (exit 1)"}`);
  if (!achieved) {
    lines.push(
      "  ※ PASS 以外（FAIL / SKIP / BLOCKED / MANUAL）が1つでもあれば未達です。" +
        "未実装のものを PASS にはしません。",
    );
  }
  lines.push("");
  return lines.join("\n");
}

export function renderJson(results, meta) {
  const achieved = results.every((r) => r.status === STATUS.PASS);
  return JSON.stringify(
    {
      schema: "ohmycms-acceptance/1",
      startedAt: meta.startedAt,
      finishedAt: meta.finishedAt,
      head: meta.head,
      baseUrl: meta.baseUrl ?? null,
      buildKind: meta.buildKind ?? null,
      achieved,
      exitCode: achieved ? 0 : 1,
      counts: results.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
      }, {}),
      results: results.map((r) => ({
        ...r,
        positive: redact(r.positive),
        negative: redact(r.negative),
        reason: r.reason ? redact(r.reason) : null,
        details: r.details.map(redact),
        repro: r.repro.map(redact),
        assertions: r.assertions.map((a) => ({ ...a, actual: redact(a.actual) })),
      })),
    },
    null,
    2,
  );
}
