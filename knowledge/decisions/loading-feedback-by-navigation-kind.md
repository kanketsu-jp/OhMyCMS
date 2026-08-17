---
type: decision
title: 読み込み中の合図は遷移の種類で分ける。「その場で変わる」ときは、まだ入れていない
description: 画面が置き換わる遷移には loading.tsx を入れたが、同じ画面のまま中身だけ変わる遷移（ページ送り・並べ替え・絞り込み）には合図が 1 つも無い。実測で 2.2 秒のあいだ何も出なかった。loading.tsx はこの用途に使えない（置き換える仕組みなので、行が消えない利点を壊す）。道具（useLinkStatus）は在るが、どこに線を置くかは未決。
tags: [ui, nextjs, apps-studio, design]
status: active
generated:
  by: agent
  at: 2026-08-17
verified: []
sources:
  - resource: "repo://apps/studio/app/(admin)/admin/content/[collection]/page.tsx"
  - resource: "repo://apps/studio/node_modules/next/dist/client/link.d.ts"
stale_after: 2027-02-17
x_rag_okf:
  id: decisions/loading-feedback-by-navigation-kind
  authorship: agent
---

# 読み込み中の合図は、遷移の種類で分ける

🚨 **この決定を書いた理由は、「入れた」だけが記録に残ると、次に数える人が
「読み込み中の表示は全部入っている」と読むから。** 実際には**半分しか入っていない**。

## 2 種類ある

| 遷移の種類 | 例 | いまの状態 |
|---|---|---|
| **画面が置き換わる** | 一覧 → 編集画面、別のコレクションへ | ✅ **`loading.tsx` が入っている** |
| **同じ画面のまま中身だけ変わる** | **ページ送り**・並べ替え・絞り込み | 🚨 **合図が 1 つも無い** |

## 🚨 実測（2026-08-17・司令塔）

```
台 … headless・latency 800ms / 60KB/s ／ /admin/content/<collection>?limit=1 で「次へ」を押す
  ms=0     行 2 ／ 骨組み 0 ／ ?limit=1
  ms=32    行 2 ／ 骨組み 0 ／ ?limit=1
  ms=2226  行 2 ／ 骨組み 0 ／ ?page=1   ← 到着
🚨 2.2 秒のあいだ、行は消えないが「来ている」印も 0
🟢 対照 … 同じ記録器が 3 回の変化を捉えている（＝ 変化を出せない計器ではない）
🟢 対照 … 押す前に「次へ」が 1 件在ることを確認
```

## ✅ 半分は既に正しい ——「行が消えない」

サーバ側で描いているので、**新しい内容に置き換わるまで前の表が残る**。
画面が跳ねない。Directus が `v-table.vue` で守っているのと同じ性質を、**結果として満たしている**。
🚨 **これは壊してはいけない。** 欠けているのは「消さないこと」ではなく「**来ていると分かること**」。

## 🚨 `loading.tsx` では解けない

`loading.tsx` は **その区画を置き換える**仕組み。その場で変わる遷移に使うと、
**いま正しく動いている「行が消えない」を壊す**。＝ **別の仕組みが要る**。

## 🟢 道具は在る（引いた・2026-08-17）

```
apps/studio/node_modules/next/dist/client/link.d.ts:117
  export declare const useLinkStatus: () => { pending: boolean };
（next 16.2.12。app-dir/link.d.ts:200 にも同じもの）
🟢 対照 同じ探し方で useRouter … 23 ファイル ／ 存在しない名前 … 0
🚨 探すときは apps/studio/node_modules を見る（根に next は無い。根で探すと 0 件に見える）
```

🚨 **ただし `useLinkStatus` は「その `<Link>` の子孫」でしか読めない。**
＝ **表の上に 1 本の細い線**は、これ単体では出せない（線を出す場所が Link の外にあるため）。
- ✅ すぐ出せる … **押したボタン自身の中の印**
- 💭 表の上の線にするなら … **pending を上へ持ち上げる形**が要る（**未測定**）

## 🚨 ページ送りは 2 系統ある（**片方だけを見て決めない**）

🚨 **この節は訂正。** 最初この決定には「**ページ送りは既に `<Link>` なので、そのまま使える形**」と
書いたが、**1 画面だけを見て母集合を切っていた**。実際は 2 つある（引いた・HEAD `8fae4c0`）。

| 系統 | 画面 | 何で描いているか | `useLinkStatus` |
|---|---|---|---|
| 🅰 | **`/admin/content/[collection]`** | `page.tsx:1` の `import Link from "next/link"` ＋ `:309-320` の `<Link>` ×2 | 🟢 **効きうる形**（未実測） |
| 🅱 | `/admin/files`・`/admin/settings/{policies,roles,users}` の **4 画面** | `ListPagination` → `PaginationPrevious/Next` → `PaginationLink` → `pagination.tsx:90` の **素の `<a>`** | 🔴 **原理的に出ない** |

```
🟢 対照 ListPagination を使う画面 … 4 件（＋部品自身 1）／ ClickableRow … 2 件
   （＝ この数え方は 0 以外も出せる）
🚨 apps/studio の中から `-- apps/studio` で絞ると、対照ごと 0 件になる。根から数える
```

🚨 **2.2 秒の実測は 🅰 の画面で採られている**（その画面は `ListPagination` を **0 件**しか使わない）。
＝ **「`PaginationLink` が `<a>` だから出ない」は 🅱 の説明であって、🅰 の説明ではない。**

🚨 **`<a>` にしている理由はコメントに書いてある**（`pagination.tsx` の `PaginationLink`）——
「**リロードでも共有でも同じページに戻る**」（憲章 §4）。
🚨 ただし司令塔の実測では、**いまも Next がソフト遷移に横取りしている**（印が遷移後も残る）。
＝ **その理由が今も成り立つかは、誰も確かめていない。**

🚨 **未実測**: 🅰 で `useLinkStatus` が**実際に出るか**は、まだ誰も撃っていない
（**形が合う**と言えるだけ。**出る/出ないを書く前に 1 回撃つこと**）。

## 🚫 まだ決めていないこと

- **線をどこに置くか**（表の上／ボタンの中／全画面）
- **一覧だけに出すか、全画面に出すか**

🚨 **堀池さん判断ではない**（Directus が細い進捗バーを出しているので、**見習うが既定**）。
**実装する人が決めてよい。**

## 関連

- [[no-nested-surfaces]] — 面の作りの決定
- [[toast-for-events-page-for-what-needs-fixing]] — 合図をどこに出すかの考え方
