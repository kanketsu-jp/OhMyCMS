---
type: decision
title: 失敗の戻り先を変えたら、その戻り先が理由を出せるかを画面で見る
description: 失敗したときの戻り先をコレクション画面からフォームの画面へ移したところ、フォームの画面が searchParams を読んでおらず ?error=conflict が黙って捨てられた。入力は残るが理由が出ない状態を作っていた。URL に鍵が付いていることは画面に文言が出ていることの証拠ではない。戻り先は 6 種類あり、欠けていたのは動かした 1 本だけだった。門 check-error-destination.mjs を過検出に倒して置いた（解決できない式は緑にしない）。
tags: [design, ux, i18n, ci, acceptance]
status: active
generated:
  by: agent
  at: 2026-08-17
verified: []
sources:
  - resource: "repo://apps/studio/app/(admin)/admin/collections/[collection]/fields/new/page.tsx"
  - resource: "repo://apps/studio/app/admin/actions/collections/[collection]/fields/route.ts"
  - resource: "repo://apps/studio/scripts/check-error-destination.mjs"
stale_after: 2027-02-17
x_rag_okf:
  id: decisions/error-destination-must-render-the-reason
  authorship: agent
---

# 失敗の戻り先を変えたら、その戻り先が理由を出せるかを画面で見る

## 背景（2026-08-17・片方を直して片方を壊した）

欄の作成が失敗すると**入力が消える**ことが分かり、`1ecfc209` で**戻り先を
コレクション画面からフォームの画面へ移した**。`FormDraft` が効くようになり、
「前回の入力が残っています／復元する／破棄する」が出るようになった。

🚨 **ところが、その戻り先は `searchParams` を読んでいなかった。**

```
実測（本物のフォームで、既に在る欄名 col_1 を送る）
  URL ………… /admin/collections/zz_schema_wide/fields/new?error=conflict
  画面の文言 … 🚨 **0 行**（帯も [role=alert] も無い）
🟢 対照 error を付けない同じ画面 … 0 行（＝ 常に出ていないのではない）
```

＝ **入力は残るようになったが、なぜ失敗したのかは分からなくなった。**
利用者から見ると「送ったのに、同じ画面に戻ってきただけ」。

## 決めたこと

**失敗の戻り先を変えたら、その戻り先が理由を出せるかを画面で確かめる。**

🚨 **URL に鍵が付いていることは、画面に文言が出ていることの証拠ではない。**
`redirectWithMessage(..., "error", key)` が付ける `?error=<鍵>` は、
受け皿（`errorKeyFromQuery` → `ErrorBanner`）を持つ画面でしか意味を持たない。

### 直した形（既に在る形をそのまま使う）

```tsx
searchParams: Promise<{ error?: string }>;
const errorKey = errorKeyFromQuery(query.error);   // 🚨 URL の値は鍵としてしか受け取らない
<ErrorBanner message={errorKey ? tError(errorKey) : null} />
```

### 戻り先を全部数えた

```
apiErrorKey を呼ぶ route … 11 本 ／ 戻り先は **6 種類**
受け皿を持つ画面 … この 1 枚を足して **6 種類とも揃った**
🟢 対照 存在しない語 … 0 件
＝ 欠けていたのは**移した 1 本だけ**
```

## 門（`scripts/check-error-destination.mjs`）

**過検出に倒してある**（司令塔の指示）。戻り先の式を解決できないときは、
**黙って緑にせず落とす**——取りこぼすと気づけないが、過検出なら人が 1 件見に行くだけ。

🚨 **2026-08-17 時点、`lefthook.yml` には登録していない**（登録は人がやる）。
＝ いまは**手で回さないと「見ていない 0」**になる: `node scripts/check-error-destination.mjs`

### この門が見ていないもの（出力にも同じものを印字する）

1. `redirectWithMessage` の呼び出しだけを見る（ほかの口で `?error=` を付ける経路は見ていない）
2. `errorKeyFromQuery` を**呼んでいるか**しか見ない。**画面へ渡しているか**は見ていない
3. 索引を見るので、まだ `git add` していない変更は見えない
4. 式を解決できないときは落とす（過検出）

### 門を作るときに、門自身が 2 回間違えた（実測）

| # | 何が起きたか | 直し |
|---|---|---|
| ① | `const formPath = <テンプレート>` の中の `path` を開かず、戻り先が**見つからないと誤報** | 識別子を**再帰的に**辿る |
| ② | 🚨 `/admin/content/*/new` が `[collection]/[id]/page.tsx` に当たった。**当たった先も受け皿を持っていたので緑**になり、**違う画面を見て緑と言っていた** | 星印は**動的セグメントにだけ**当てる |

＝ ②は「**同じ結論が違う理由で出る**」形。**緑だったから正しい、とは言えない。**

### RED を 3 通り測った（本物の索引を汚さずに）

`readTracked` は索引を読むので、壊した版を `git add` しないと**壊しが被検査物に届かない**。
そこで **`GIT_INDEX_FILE` に索引の写しを渡して** add した（本物の索引は無傷）。

```
🟢 素の状態（写しの索引）… 17 / 17・rc=0（この台が GREEN を再現できる）
🔴 ① 受け皿を消す ……… rc=1「errorKeyFromQuery が無い」（route と page を名指し）
🔴 ② 画面の無い戻り先 … rc=1「対応する page.tsx が索引に見つかりません」
🔴 ③ 式を解決できない … rc=1「戻り先の式を解決できません: formPath」
🟢 戻して測り直す ……… 17 / 17・rc=0 ／ 本物の索引と作業ツリーの差分 **0 行**
```

## 関連

- [[checks-must-declare-blind-spots]] — 検査は「何を見ていないか」を言えて初めて検査になる
- [[checks-read-the-index-not-the-worktree]] — 検査は索引を見る（だから RED は add してから測る）
- [[toast-for-events-page-for-what-needs-fixing]] — 直すべきものは画面に残す
- [[action-button-and-edit-mode]] — 入力を残す側の決め（この件の発端）
