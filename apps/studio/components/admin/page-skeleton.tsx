import { Skeleton } from "@/components/ui/skeleton";

/**
 * 画面が来るまでの間に出す骨組み。**`loading.tsx` から呼ぶ**。
 *
 * 🚨 **文言を出さない。** 「読み込み中…」は辞書が要るうえ、数百 ms で消える文字になる。
 * 🚨 **`loading.tsx` は Next の約束でその場所に置く必要が在る**ので、
 *    ファイル自体は各ディレクトリに要る。**中身だけここへ寄せる**
 *    （同じ 20 行が 32 本に散ると、直すとき 32 箇所になる）。
 * 🚨 **遷移のときだけ置き換えてよい**（もうその画面を見ていない）。
 *    その場で変わるとき（絞り込み・並べ替え）は消してはいけない——別の仕組みが要る。
 */
export function PageSkeleton() {
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
