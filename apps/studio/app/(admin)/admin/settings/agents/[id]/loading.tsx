import { Skeleton } from "@/components/ui/skeleton";

/**
 * 一覧から 1 件へ移る間に出す骨組み。
 *
 * 🚨 **文言を出さない。** 「読み込み中…」と書くと辞書が要り、
 *    しかも **数百 ms で消える文字**になる。形だけで「来ている」と伝える。
 * 🚨 **遷移のときだけ置き換えてよい**（もうその一覧を見ていない）。
 *    その場で変わるとき（絞り込み・並べ替え）は消してはいけない——別の仕組みが要る。
 */
export default function Loading() {
  return (
    <div className="max-w-6xl space-y-6" aria-hidden>
      <Skeleton className="h-7 w-56" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-9/12" />
      </div>
    </div>
  );
}
