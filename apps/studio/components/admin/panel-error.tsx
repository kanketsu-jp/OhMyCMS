"use client";

import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { useT } from "@/i18n/client";

/**
 * 右サイドバーの節が **取りに行けなかった**ときに出す 1 行 ＋ もう一度読み込むボタン。
 *
 * ## 🚨 なぜ作ったか（2026-08-17 実測・司令塔の「途中で失敗したとき」の走査）
 *
 * `fetch` を差し替えて 403 / 500 / 通信断を起こし、右サイドバーの 3 節を見た。
 * 見る観点は 3 つ（司令塔）: ①何が起きたか分かるか ②次に何をすればよいか ③その画面から出られるか
 *
 * ```
 * 表示・切り替え … 「表示設定を読み込めません」  ① 🟢  ② 🚨 無し  ③ 🟢
 * ログ・履歴 ……… 「読み込めませんでした」      ① 🟢  ② 🚨 無し  ③ 🟢
 * 🚨 保管先 ……… **何も出ない**（節ごと消える） ① 🚨 分からない ② 🚨 無し ③ 🟢
 *    ＝ 「この画面には無い」「まだ読み込み中」「取りに行けなかった」が**全部同じ見た目**だった
 *      （`panel-storage.tsx` が `!enabled || failed || status === null` を 1 つの `null` に落としていた）
 * 🟢 対照 差し替えが効いた回数 4（/admin/content）・2（/admin/files）＝ 見ていない 0 ではない
 * 🟢 対照 覆い 0 ／ 閉じるボタン 3（3 モードとも）＝ ③ は元から満たしている
 * ```
 *
 * ## 🚨 理由は書かない（403 と 500 と通信断を区別して見せない）
 *
 * 利用者にできることは**どれも同じ（もう一度試す）**で、区別しても行動が変わらない。
 * 逆に「権限がありません」と書くと、**管理画面が二値**である事実
 * （`knowledge/decisions/admin-ui-is-all-or-nothing.md`）と食い違って読める。
 * 🚨 **ただし「出せない」と「無い」は必ず分ける。** それが上の実測で壊れていた点。
 *
 * ## 🚨 3 節に同じものを書かない
 *
 * 直す前は 3 節がそれぞれ `<p>` を書いていた。ここへ寄せる
 * （`DESIGN.md` §0-1・`list-empty.tsx` と同じ考え方——**寄せ先が無いと同じ行が散る**）。
 */
export function PanelError({
  message,
  onRetry,
  expired = false,
}: {
  message: string;
  onRetry: () => void;
  /**
   * 🚨 **もう一度押しても直らない失敗**（セッションが切れた＝ 401）かどうか。
   *
   * 3 つの口はどれも `requireActor(request)` を最初に通すので、
   * **開いたまま時間が経つと 401 が返る**（`panel-display.tsx` に実測の申し送りが在る）。
   * そのとき「もう一度読み込む」を出すのは**嘘**——何回押しても直らない。
   */
  expired?: boolean;
}) {
  const t = useT("panel");
  const tError = useT("errors");

  // 🚨 **直らないものに「もう一度」と言わない**（DESIGN.md・2026-08-17 司令塔）。
  //    何をすれば直るか（ログインし直す）を出す。文言は既に在る `errors.unauthenticated` を使う
  //    （同じことを 2 通りで書かない。**その辞書は他レーンが触っているので読むだけ**）。
  if (expired) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-muted-foreground">{tError("unauthenticated")}</p>
        <Link href="/login" className={buttonVariants({ variant: "outline", size: "sm" }) + " rounded-none"}>
          {t("relogin")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-sm text-muted-foreground">{message}</p>
      {/* 🚨 角丸を使わない（`DESIGN.md` §1-1）。小さくしない（§2-2・§1-7）。 */}
      <Button type="button" variant="outline" size="sm" className="rounded-none" onClick={onRetry}>
        {t("retry")}
      </Button>
    </div>
  );
}
