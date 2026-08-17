---
type: decision
title: 確認を出す基準は「戻せない」か「一度に多数へ及ぶ」。見た目の色は戻せるかだけで決める
description: 確認ダイアログを出すかどうかを、①戻せない（deleted_at を持たない）②一度に多数へ及ぶ（一括・cascade）の 2 軸で決める。どちらか 1 つでも当たれば出し、両方外れるなら出さない。実測すると、いまは逆になっている（取り消せない 7 件のうち確認が在るのは 1 件、戻せる 6 件のうち 2 件）。あわせて、危険色は「戻せるか」の 1 軸だけで決める（警告色は作らない）。
tags: [design, ux, destructive-actions, alert-dialog, permissions]
status: active
generated:
  by: agent
  at: 2026-08-17
verified: []
sources:
  - resource: "repo://apps/studio/components/ui/alert-dialog.tsx"
  - resource: "repo://apps/studio/components/admin/files-table.tsx"
  - resource: "repo://apps/studio/lib/trash/service.ts"
  - resource: "repo://knowledge/decisions/action-button-and-edit-mode.md"
  - resource: "repo://knowledge/decisions/every-element-must-earn-its-place.md"
stale_after: 2027-02-17
x_rag_okf:
  id: decisions/confirm-by-reversibility-and-reach
  authorship: agent
---

# 確認を出す基準は「戻せない」か「一度に多数へ及ぶ」

> 由来: 2026-08-17。toast が**画面から起こせる削除 13 件**を数え、
> **確認の有無が「戻せなさ」と対応していない**ことを実測で出した。
> 関連: [[action-button-and-edit-mode]]（破壊的な操作は ▾ の中）／[[every-element-must-earn-its-place]]

## 0. 決めたこと

**確認ダイアログを出すのは、次のどちらか 1 つでも当たるときだけ。両方外れるなら出さない。**

```
① 戻せない …… ゴミ箱に入らない（その表が `deleted_at` を持たない）
② 一度に多数へ及ぶ … 選んでまとめて実行する／**cascade で他の行も消える**
```

🚨 **「戻せなさ」だけで決めない。** それが今回いちばん大事な訂正。

## 1. なぜ 1 軸では足りないか

```
🔴 toast の実測（2026-08-17・HEAD e76ee1b）
   画面から起こせる削除 … 13 件（DELETE 11 ＋ form POST 2）
   取り消せない 7 … agents / policies / roles / users-policy /
                    trash(完全削除) / 表の削除 / 関連の削除
   🚨 そのうち確認が在るのは **1 件**（trash の完全削除）
   戻せる 6 …… file-detail / file-tile-menu / files-table(まとめて) /
                folder-grid / labels / policy-permissions
   🚨 そのうち確認が在るのは **2 件**（labels ／ files-table のまとめて削除）
＝ 🚨 **確認の有無が、戻せなさと対応していない**
```

**ここで「戻せるのに確認が在る 2 件は間違いだ」と読むと、直し方を誤る。**
`files-table` のまとめて削除は**ゴミ箱へ入るだけ＝戻せる**が、**一度に何件でも動く**。
危ないのは戻せなさではなく **件数**——**選択を間違えたことに、実行するまで気づけない**。

🚨 だから軸は 2 本。**①だけを基準にすると、この 1 件を「余分」として外してしまう。**

## 2. いまの状態を、2 軸で並べ直す

| | 判定 | いま | どうする |
|---|---|---|---|
| agents / policies / roles / users-policy / 表の削除 / 関連の削除 | ①に当たる | 確認**無し** | 🔴 **足す** |
| roles | ①＋② | 確認**無し** | 🔴 **足す。本文に「割り当ても消える」と書く** |
| trash の完全削除 | ① | 確認在り（danger） | 🟢 そのまま |
| files-table のまとめて削除 | ② | 確認在り（既定色） | 🟢 そのまま |
| labels | どちらも外れる（戻せる・1 件ずつ） | 確認在り | 🟡 **外してよい** |
| file-detail / file-tile-menu / folder-grid / policy-permissions | どちらも外れる | 確認無し | 🟢 そのまま |

🚨 **roles の②は、画面のコードを読んでも分からない。**
toast の実測で `directus_access.role` が **ON DELETE CASCADE** だと分かった。
＝ **「一度に多数へ及ぶ」は DB のスキーマにも書いてある。** 画面だけ見て判定しない。

## 3. 色は 1 軸（戻せるかだけ）

**`tone="danger"` にするのは①（戻せない）のときだけ。②だけで当たったものは既定の色。**

```
🚨 **警告色（`warning`）は作らない。** base2 が Directus で見た「削除＝危険 / アーカイブ＝警告」の
   2 段階は採らない。理由:
   ・この PJ に `warning` のトークンも variant も無い（＝ パレットに手を入れる別の判断）
   ・**②で当たったものを「警告色」で括ると、また「同じ顔で違う意味」になる**
     （まとめてゴミ箱へ入れる ＝ 戻せる。離脱の確認 ＝ 入力が消える。別の話）
🚨 実測（toast）… いま `variant="destructive"` は 3 件／`warning` は 0 件
```

## 4. 文面の型

```
題 …… 何が起きるかを 1 行（「完全に削除しますか」「ゴミ箱へ入れますか」）
本文 … ① **戻せるかを必ず書く**（「ゴミ箱から戻せます」／「元に戻せません」）
      ② **及ぶ範囲を書く**（「{count} 件」／🚨「この役割の割り当ても消えます」）
ボタン … 進める側は**その操作の動詞**（「削除する」「ゴミ箱へ入れる」）。
      🚨 **「OK」にしない**（何が起きるか、ボタンだけで分からなくなる）
やめる … `AlertDialogCancel` の既定（`common.action_cancel`）。**焦点はこちらに当てる**
```

🚨 **`window.confirm` を使わない。** ボタンが OS の言語で出るため
（`AGENTS.md` §3.8「全文言が自前の辞書にある」への違反。実コードは 2026-08-17 に 0 件へ）。

## 5. やらないこと

- ❌ 「戻せなさ」だけで確認の要不要を決める（**②を落とす**）
- ❌ 一括操作なのに確認を出さない（**選択の間違いに気づけない**）
- ❌ 戻せて 1 件ずつの操作に確認を出す（**押す回数が増えるだけ**）
- ❌ 警告色を足す（**トークンごと足す判断は別**）
- ❌ cascade を画面のコードだけで判定する（**スキーマを引く**）

## 6. レビュー観点

- [ ] その操作は①（戻せない）か②（多数へ及ぶ）に当たるか。**両方外れるなら確認は出さない**
- [ ] ②の判定に **cascade を引いたか**（`ON DELETE CASCADE` の有無）
- [ ] 本文に「戻せるか」と「及ぶ範囲」の 2 つが書いてあるか
- [ ] 進めるボタンが動詞になっているか（「OK」でないか）
- [ ] 色を①だけで決めているか（②で danger にしていないか）
