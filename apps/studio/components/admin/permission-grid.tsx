"use client";

import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * 権限の**格子**の 1 マス。**押すと編集が開く**（ここでは何も書き換えない）。
 *
 * 由来: 2026-08-17。堀池指示「**権限の設定変更などどんなふうに ui を作っているか**」。
 * それまでは **平らな一覧＋下に追加フォーム**で、
 * 「このコレクションの read は許可されているか」を**行を目で探して**確かめる形だった。
 *
 * ## 🚨 マスを押しても、何も消えない
 *
 * **押す ＝ 編集を開く。切り替えではない。**
 * 【引いた】権限の削除は **物理削除**（`lib/admin/permissions-api.ts:348` `.delete()`）で、
 * **「条件つき → なし」にすると、書いた行フィルタ JSON ごと消える**。
 * 🚨 **格子はクリックが安い UI。安い操作で、戻せないものを消してはいけない**
 * （`knowledge/decisions/confirm-by-reversibility-and-reach` §2.5）。
 * → **マスは開くだけ**。消すのは、開いた先の「削除」（**確認つき**）だけにしてある。
 *
 * ## 🚨 3 値は、いまのデータからそのまま決まる
 *
 * **新しい概念を足していない**（`permissions` と `fields` の有無を読むだけ）:
 * ```
 * なし …… 権限の行が無い
 * すべて … 行が在り、**行フィルタも欄の指定も無い**
 * 条件つき … 行が在り、**行フィルタか欄の指定が在る**
 * ```
 * 🚨 **行フィルタと欄の指定を、見た目で分けない**（司令塔と合意・2026-08-17）。
 *   「条件つき」は利用者にとって「**そのまま消すと何か失う**」の印として働くので、
 *   **失うものが何かは、開いた先で分かれば足りる**。
 * 🚨 **空の行フィルタは「条件」ではない**——`null` / `{}` / `""` は**全行許可**
 *   （`knowledge/decisions/rowfilter-empty-is-allow-all`。security の実測）。
 *   ここで条件つきに数えると、**失うものが無いのに「消えます」と警告する**ことになる。
 *
 * 🚨 **`resolve.ts` の `hasUnfilteredRow` とは、わざと揃えていない**（2026-08-17・実測して確認）。
 *   あちらは `permissions === null || undefined` **だけ**を「行フィルタ無し」と見る（`:232`）ので、
 *   **`{}` は「フィルタ在り」として扱われる**。
 *   ＝ 🚨 **2 つの述語が在る**:
 *     `hasUnfilteredRow` … **他のポリシーの行フィルタを捨ててよいか**（合成の近道）
 *     ここ ………………… **この 1 マスが、利用者にとって制限になっているか**（表示）
 *   **`{}` は「制限になっていない」**（全行に当たる）ので、**表示は「すべて」が正しい**。
 *   🚨 **合成のほうは私の担当外**。`{_or: [{}, {x}]}` が全行になるかは**誰も測っていない**
 *     （security へ渡してある）。**このマスは 1 行だけを語る**ので、そこには踏み込まない。
 */
export type CellState = "none" | "all" | "conditional";

/**
 * 権限 1 行から、マスの 3 値を決める。
 * 🚨 **判定はここ 1 箇所**。画面側で `row.permissions` を直接見ないこと（2 箇所に散ると必ず割れる）。
 */
export function cellStateOf(row: { permissions: unknown; fields: string | null } | undefined): CellState {
  if (!row) return "none";
  // 🚨 空は「条件が無い」。`rowfilter-empty-is-allow-all` のとおり null / {} / "" は全行許可。
  const filter = row.permissions;
  const hasFilter =
    filter !== null &&
    filter !== undefined &&
    filter !== "" &&
    !(typeof filter === "object" && Object.keys(filter as object).length === 0);
  const fields = (row.fields ?? "").trim();
  const hasFieldLimit = fields !== "" && fields !== "*";
  return hasFilter || hasFieldLimit ? "conditional" : "all";
}

export function PermissionCell({
  state,
  label,
  stateLabel,
  onOpen,
}: {
  state: CellState;
  /** 読み上げ用（「{コレクション} の {操作}」）。**見えている文字は状態の名前**。 */
  label: string;
  stateLabel: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${label}: ${stateLabel}`}
      className={cn(
        "inline-flex min-h-8 w-full items-center justify-center gap-1 rounded-md px-2 text-xs",
        // 🚨 **色だけで伝えない**（`files-table` と同じ判断）。**必ず文字も出す**。
        state === "all" && "bg-primary/10 text-foreground",
        state === "conditional" && "bg-muted text-foreground ring-1 ring-foreground/15",
        state === "none" && "text-muted-foreground hover:bg-muted",
      )}
    >
      {state === "all" ? <Check className="size-3.5" aria-hidden /> : null}
      {state === "conditional" ? <Minus className="size-3.5" aria-hidden /> : null}
      <span>{stateLabel}</span>
    </button>
  );
}
