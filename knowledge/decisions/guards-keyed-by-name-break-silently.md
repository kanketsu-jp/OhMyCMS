---
type: decision
title: 欄の名前で効く守りは、名前を変えた瞬間に黙って外れる
description: 下書きの保存除外のように「欄の name / id を正規表現で見て弾く」守りは、表示文言を直すついでに名前を変えると、何も壊れず何も鳴らないまま外れる。名前に依存する守りを見つけたら、その旨をその場に書き、名前を変えないことを受入で確かめる。初期設定の「パスワード」を「管理者コード」と呼び替える作業で、実際に一歩手前まで行った。
tags: [security, design, forms, i18n]
status: active
generated:
  by: agent
  at: 2026-08-16
verified: []
sources:
  - resource: "repo://apps/studio/components/admin/form-draft.tsx"
  - resource: "repo://apps/studio/components/admin/onboarding-form.tsx"
stale_after: 2027-02-16
x_rag_okf:
  id: decisions/guards-keyed-by-name-break-silently
  authorship: agent
---

# 欄の名前で効く守りは、名前を変えた瞬間に黙って外れる

## 決定

**欄の `name` / `id` を見て効く守りが在るなら、その欄の近くに「名前を変えるな」と書く。**
そして **受入で「実際に保存されていないこと」を確かめる**（「除外されるはず」で終わらせない）。

## 何が起きかけたか（2026-08-16・初期設定の 3 段化）

```
`components/admin/form-draft.tsx`（下書きを localStorage に残す部品・12 画面で使用）
  SECRET_FIELD_PATTERN = /password|secret|token|key/i
  → 欄の name / id がこれに当たると **保存しない**（秘密を localStorage に置かない判断）
```

ご指示（298）は **「パスワードではなく『管理者コード』という表現にする」**。
表現を変えるとき、**欄の `id` も `admin-code` にしたくなる**。

```
【測った】/password|secret|token|key/i に当たるか
  new-password  → **当たる**（保存されない）
  admin-code    → 🚨 **当たらない**（保存される）
```

🚨 **規則を曲げていないのに、結果は「秘密を localStorage に置く」に変わる。**
しかも **何も壊れず、何も鳴らない**。

## だからこうする

```
✅ **見える文言と、内部の名前を分ける**
   表示は辞書で「管理者コード」／欄は `id="new-password"` のまま
✅ その欄の**すぐ横に理由を書く**（「id から password を外すと守りが外れる」）
✅ 受入で **localStorage を実際に見る**
```

**実測（2026-08-16・Storybook + headless）:**

```
① 管理者コード欄に値を入れる → ② 次へ → ③ テナント名・サービス名に値を入れる
localStorage:
  "ohmycms:draft:/iframe.html:onboarding-details-form":
    {"project-name":["PROBE-SERVICE-9911"],"tenant-name":["PROBE-TENANT-9911"]}
🚨 管理者コードの値は **入っていない**
🟢 対照 テナント名・サービス名は **入っている**（＝ この確かめ方は「在る」も出せる）
```

## 🚨 これは「案として選ぶ」ものではない

同じ結果になる 3 つの道が在り、**危なさが違う**。

| | やること | 結果 |
|---|---|---|
| A | 表示だけ変える（採用） | 秘密は保存されない |
| B | `SECRET_FIELD_PATTERN` を曲げる | 秘密が保存される。**曲げた自覚が在る** |
| 🚨 C | 欄の名前を変える | 秘密が保存される。**曲げた自覚が無い** |

🚨 **C がいちばん危ない。** 「規則を守っている」つもりのまま、結果は B と同じになる。

## より強い形（未実施）

**名前ではなく、宣言で除外する**（例: その欄に「保存しない」印を付け、部品はそれを見る）。
🚨 **いまは入れていない。** `form-draft.tsx` は 12 画面で使われており、
除外の判定を変えると 12 画面の挙動が同時に動くため、**別の作業として切り出す**。

## レビュー観点

- [ ] 欄の `name` / `id` を見て効く守りが、他にも在るか（**探し方は名前ではなく、正規表現の側から**）
- [ ] 文言を変える作業で、**内部の名前まで一緒に変えていないか**
- [ ] 「除外されるはず」で終わらせず、**保存先を実際に見たか**（在る側の対照つきで）
