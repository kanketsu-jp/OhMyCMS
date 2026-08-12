/**
 * 判定の型と、判定を作るためのヘルパ。
 *
 * 設計の要は「肯定形」と「否定形」を必ず両方持つこと。
 * 否定形だけのチェックは、**対象が存在しなければ自明に通る**（F9h §2）。
 *   例: 「A に B の行が見えない」は、B の行を誰も作っていなければ常に真。
 * そのため Result は positive / negative の2欄を必ず持ち、
 * 両方が満たされて初めて PASS になる。
 */

/** 判定の状態。PASS 以外はすべて「未達」として扱う。 */
export const STATUS = {
  /** 肯定形・否定形の両方が満たされた。 */
  PASS: "PASS",
  /** 満たされなかった。details に理由と再現コマンドを入れる。 */
  FAIL: "FAIL",
  /** 実装がまだ無い（packages/cli, packages/mcp 等）。PASS にしてはいけない。 */
  SKIP: "SKIP",
  /** 実装はあるが、いまの環境では判定できない（他ペインが稼働中など）。 */
  BLOCKED: "BLOCKED",
  /** 機械では判定しない。人が手順書どおりに操作する。 */
  MANUAL: "MANUAL",
};

/** PASS 以外はすべて未達。SKIP も MANUAL も「通った」ではない。 */
export function isPass(result) {
  return result.status === STATUS.PASS;
}

/**
 * 1項目の判定を作る。
 *
 * @param {object} spec
 * @param {number} spec.id            受入基準の番号（1〜9）
 * @param {string} spec.title         表に出す名前
 * @param {string} spec.status        STATUS のどれか
 * @param {string} [spec.positive]    肯定形の実測値（例: "200"）
 * @param {string} [spec.negative]    否定形の実測値（例: "404"）
 * @param {string} [spec.reason]      SKIP / BLOCKED / MANUAL の理由
 * @param {string[]} [spec.details]   FAIL の詳細。人が読む
 * @param {string[]} [spec.repro]     再現できるコマンド。次の人が追えるように
 * @param {object[]} [spec.assertions] 個々の検査の内訳
 */
export function result(spec) {
  return {
    id: spec.id,
    title: spec.title,
    status: spec.status,
    positive: spec.positive ?? "-",
    negative: spec.negative ?? "-",
    reason: spec.reason ?? null,
    details: spec.details ?? [],
    repro: spec.repro ?? [],
    assertions: spec.assertions ?? [],
    ms: spec.ms ?? null,
  };
}

/**
 * 個々の検査（assertion）。
 * kind は "positive"（こうなるはず）か "negative"（こうならないはず）。
 * **negative だけの check を書かないこと。** 必ず対になる positive を先に置く。
 */
export function assertion(kind, label, ok, actual, expected) {
  return { kind, label, ok, actual: String(actual), expected: String(expected) };
}

/** assertion の配列から PASS / FAIL を決める。 */
export function statusFromAssertions(assertions) {
  const hasPositive = assertions.some((a) => a.kind === "positive");
  const hasNegative = assertions.some((a) => a.kind === "negative");

  // 肯定形が1つも無いチェックは、自明に通る恐れがあるので信用しない。
  if (!hasPositive || !hasNegative) {
    return {
      status: STATUS.FAIL,
      details: [
        "このチェックは肯定形と否定形の両方を持っていません（ハーネス側の不備）。" +
          `positive=${hasPositive} negative=${hasNegative}`,
      ],
    };
  }

  const failed = assertions.filter((a) => !a.ok);
  if (failed.length === 0) return { status: STATUS.PASS, details: [] };

  return {
    status: STATUS.FAIL,
    details: failed.map(
      (a) =>
        `[${a.kind === "positive" ? "肯定形" : "否定形"}] ${a.label}: ` +
        `期待 ${a.expected} / 実測 ${a.actual}`,
    ),
  };
}
