"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * 確認の中身。**呼ぶ側が文言まで決める**。
 *
 * 🚨 **部品が「これは危ない」と判断しない**（司令塔の条件①・2026-08-17）。
 *   `ListEmpty` と同じ理由——**部品が画面の事情を持ち始めると、次に条件が増えたとき
 *   部品を直しに来ることになる**。ここは「渡されたら出す」だけ。
 *
 * 🚨 **文面の型は `knowledge/decisions/confirm-by-reversibility-and-reach.md` §4**:
 *   題＝何が起きるか／本文＝**戻せるか ＋ 及ぶ範囲**／進めるボタン＝**その操作の動詞**（「OK」にしない）。
 */
export type ConfirmSpec = {
  title: string;
  description: string;
  /** 進めるボタンの文言。🚨 **その操作の動詞**にする。 */
  confirmLabel: string;
  /**
   * 🚨 **`danger` にするのは「戻せない」ときだけ**（決定 §3）。
   *   「一度に多数へ及ぶ」だけで当たったものは既定の色。
   */
  tone?: "default" | "danger";
};

/**
 * 確認ダイアログ。**この PJ に実装は 1 つだけ**。
 *
 * 由来: 2026-08-17。`confirm-submit.tsx` を書いた直後に、`PageAction` と `RowOptions` の
 * ▾ 項目にも同じものが要ると分かった。**3 つ書くと、次に文面の型を直す人が 1 つ落とす**
 * （この PJ で今日 6 回起きている形）ので、**実体をここへ 1 本にまとめる**。
 *
 * 🚨 **メニューの外へ置くこと。** Radix の `DropdownMenu` は項目を選ぶと閉じるので、
 *   ダイアログを項目の中に置くと**開く前に外れる**。
 *   ＝ 呼ぶ側は「どの項目が確認待ちか」を state で持ち、**メニューの兄弟として**これを描く。
 */
export function ConfirmDialog({
  spec,
  onConfirm,
  onClose,
}: {
  /** `null` なら閉じている。 */
  spec: ConfirmSpec | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <AlertDialog
      open={spec !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {spec ? (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{spec.title}</AlertDialogTitle>
            <AlertDialogDescription>{spec.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction
              tone={spec.tone ?? "default"}
              onClick={() => {
                onClose();
                onConfirm();
              }}
            >
              {spec.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      ) : null}
    </AlertDialog>
  );
}

/**
 * その id の `<form>` を送る。**確認を通ったあとに呼ぶ**。
 *
 * 🚨 `submit()` ではなく `requestSubmit()`。
 *   `submit()` は **`onsubmit` も HTML の検証も飛ばす**ので、
 *   「押したときと違うことが起きる」ようになる。
 */
export function submitFormById(formId: string): void {
  const form = document.getElementById(formId);
  if (form instanceof HTMLFormElement) form.requestSubmit();
}
