/**
 * その場で直す必要がある入力・通信エラーを表示する共通バナー。
 *
 * 🚨 成功などの出来事はトースト、利用者が直す必要のある状態だけをここに出す。
 * 色は意味トークンを使い、生の色や画面ごとのエラー枠を増やさない。
 *
 * 参考: `knowledge/decisions/toast-for-events-page-for-what-needs-fixing.md` ／ `DESIGN.md` §0-1
 */
export function ErrorBanner({ message }: { message?: string | null }) {
  if (!message) return null;

  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-base text-destructive">
      {message}
    </div>
  );
}
