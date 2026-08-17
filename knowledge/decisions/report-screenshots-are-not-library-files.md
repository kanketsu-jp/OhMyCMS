---
type: decision
title: 不具合報告の画面写真は、ファイル一覧に出さない
description: 報告に添える画面写真を directus_files へ上げず、報告専用の置き場に置く。ファイル機能の見え方の設定に画面写真が乗ると、その設定を緩めた瞬間に写真も緩むため。上限は既存の 1 本から配る。
tags: [design, permissions, reports, files]
status: active
generated:
  by: rag-okf
  at: 2026-08-17
verified: []
sources:
  - resource: "repo://apps/studio/lib/files/service.ts"
  - resource: "repo://apps/studio/app/api/assets/[id]/route.ts"
  - resource: "repo://apps/studio/app/api/reports/[id]/route.ts"
  - resource: "repo://apps/studio/lib/reports/service.ts"
  - resource: "repo://apps/studio/lib/files/upload-limit.ts"
  - resource: "repo://knowledge/decisions/relation-permission-boundary.md"
stale_after: 2027-02-17
x_rag_okf:
  id: decisions/report-screenshots-are-not-library-files
  authorship: agent
---

# 不具合報告の画面写真は、ファイル一覧に出さない

> 由来: 2026-08-17。堀池さんの I3「画像もアップロードできるようにします」を受けて、
> **どこに置くか**を決めた。判断したのは司令塔（w4A:p1P）、材料を測ったのは pages（w4A:p2F）。
> 基準日 2026-08-17 / HEAD 74075e5 時点の実測。

## TL;DR

- ✅ **報告専用の置き場に置く**（新しいテーブル ＋ 報告と同じ規則で配る口）
- ❌ **既存の `POST /api/files` に上げて `directus_files` に混ぜない**
- 🚨 理由は値段ではない。**判断が 2 か所に割れるから**
- ✅ **上限は `lib/files/upload-limit.ts` の 1 本から配る**（報告側で 2 つ目を作らない）

---

## 1. 決定

```
✅ 報告の添付は、報告専用の置き場へ置く
   配る口の「誰が見てよいか」は **既にある規則をそのまま使う**:
     app/api/reports/[id]/route.ts … canManageReports(actor) と viewer（＝報告者本人）
   ＝ **新しい権限の概念を作らない**
❌ 既存の POST /api/files に上げて、報告に file の id を持たせる形は採らない
```

## 2. なぜ（実測が根拠）

### 2-1. ファイルの一覧は「上げた人」で絞られていない

**【測った・2026-08-17・共有 dev の既存セッションで読むだけ】**

```
私は誰か ………………… files-lane-probe（自分では 1 つもファイルを上げていない）
/api/files で見えた件数 … 23
その uploaded_by の内訳 … 2 人（18 件 と 5 件）。**自分のものは 0 件**
🟢 対照 存在しない口 …… 404（＝ この計器は 0 も 23 も 404 も出せる）
```

`listFiles` は `permissionForAction(actor, "directus_files", "read")` を通り、
その policy に行フィルタが無ければ**全員のファイルが見える**。実測がその状態だった。

### 2-2. 配信の口も同じ扱い（ちぐはぐではない）

```
/api/assets/[id] は一見 requireActor だけに見えるが、
getAsset の中で permissionForAction(actor, "directus_files", "read") を通し、
行フィルタを findFile へ渡している（lib/files/service.ts:973-977）
```

＝ **一覧も配信も、同じ `directus_files` の読み取り権限で決まる。**
だから「一覧に出さなければ見えない」ではない。**権限が 1 つで両方を決めている。**

### 2-3. だから、混ぜると判断が 2 か所に割れる

不具合報告の画面写真には、**報告した人が見ていた画面がそのまま写る**（他人の氏名・
メール・売上のような中身が入りえる）。これを `directus_files` に混ぜると:

- 画面写真の見え方が、**ファイル機能の見え方の設定**に従う
- ＝ **その設定を緩めた瞬間に、画面写真も一緒に緩む**
- ＝ `AGENTS.md §3.5`（権限はフィルタで隠すのでなく、サーバ側で拒否する）と逆向き

🚨 **これは「うっかり漏れる」ではない。仕様として漏れる。**

### 2-4. 値段の差は判断の理由にならない

**【数えた・触るファイルの数。実装したわけではない】**

```
A（既存の /api/files に混ぜる）…… 6 本（うち新規 1）
B（報告専用の置き場）…………… 9 本（うち新規 4）
＝ 1.5 倍
```

🚨 **最初 pages は「2〜3 倍」と書いた。測っていない数だった。**
数え直して 1.5 倍と訂正したことで判断が変わった（司令塔の言葉:
「1.5 倍と 3 倍では判断が変わります。訂正が無ければ A に寄せていたかもしれません」）。
＝ **見積もりを実測に置き換えるまで、値段を判断材料にしない。**

## 3. 上限は 1 本から配る

```
【引いた】lib/files/upload-limit.ts
   既定 20MB（堀池さん 296「初期値は 20MB」）
   🚨 上限は 1 段ではない。詰まる場所が 2 つ在る:
      ① アプリの検証（lib/files/service.ts）
      ② Next の要求の受け口（experimental.proxyClientMaxBodySize・既定 10MB）
   ＝ この 1 ファイルから両方へ配っている
```

✅ **報告の添付でも、この 1 本を読む。報告側に 2 つ目の上限を書かない。**
書くと「通す門と落とす門が食い違う」形（実際に 2026-08-16 に起きて、
50MB の判定へ一度も到達せず 10MB 超で HTTP 500 になっていた）が再発する。

🚨 **未測定**: 本番の前段（Dokploy の Traefik）の上限は、このリポジトリからは分からない。
`compose.dokploy.yml` に「Traefik ラベルは手書きしない。Dokploy が管理する」と書いてある。
**本番で 20MB が通るかは未検証のまま残す。**

## 4. やらないと決めたこと

- ❌ `directus_files` の policy に行フィルタ（`uploaded_by = 自分`）を入れて A を成立させる
  → 🚨 それは**報告の機能ではなく権限の設定**で、**他の画面の見え方も変わる**。
    報告のためにファイル機能の仕様を変えるのは順番が逆。
- ❌ 報告の添付に独自の上限を持たせる（§3）

## 5. レビュー観点

- [ ] 添付を配る口が、`canManageReports` と viewer（報告者本人）で閉じているか
- [ ] `directus_files` の権限に**依存していない**か（依存していたら A に戻っている）
- [ ] 上限を `lib/files/upload-limit.ts` から引いているか（2 つ目を作っていないか）
- [ ] 「本番の前段の上限」を未測定のまま残しているか（測ったふりをしていないか）
