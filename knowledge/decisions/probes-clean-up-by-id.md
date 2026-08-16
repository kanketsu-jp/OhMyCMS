---
type: decision
title: 台が作った利用者は、作った人が id で消す
description: 共有 DB に使い捨ての利用者を作る道具（dev-login）は在るのに、消す作法がリポジトリに無い。2026-08-16 に 2 人が同じ穴に落ちた（片方は 2 人作って丸一日放置、片方は台本 103 本に DELETE が 0 本）。他人のものは消さない・自分の台が作ったものは自分が id で消す・常設 fixture は対象外、の 3 つを噛み合わせて決める。確認は総数ではなく id の残存で行う。
tags: [acceptance, testing, ops, permissions]
status: active
generated:
  by: agent
  at: 2026-08-16
verified: []
sources:
  - resource: "repo://knowledge/decisions/permanent-fixtures-are-not-junk.md"
  - resource: "repo://apps/studio/app/api/auth/dev-login/route.ts"
  - resource: "repo://apps/studio/app/api/users/route.ts"
stale_after: 2027-02-16
x_rag_okf:
  id: decisions/probes-clean-up-by-id
  authorship: agent
---

# 台が作った利用者は、作った人が id で消す

> 由来: 2026-08-16。共有 DB に「持ち主不明の利用者」が見つかり、司令塔が全員に心当たりを
> **3 回**聞いた。**2 人が名乗り、2 人とも同じ穴だった**——
> **作る道具は在るのに、消す作法がリポジトリに無い**。
>
> 🚨 **個人の不注意ではない。** 片方は「後始末を忘れた」のではなく
> **最初から書いていなかった**（＝ 注意では戻らない）。もう片方は台本 **103 本**に
> **DB の `DELETE` が 0 本**だった（本人の名乗り）。
>
> 対になる決定: [検証用に見えるデータを、名乗りが無いという理由で消さない](./permanent-fixtures-are-not-junk.md)

## 0. なぜ決めるか — **片側だけが文書化されていた**

【測った・2026-08-16】`knowledge/` の中:

```
「dev-login」 …… 6 件   ＝ **使い方**は書かれている
「id で撃つ」 …… 0 件   ＝ 🚨 **後始末の作法が無い**
🟢 対照 permanent-fixtures-are-not-junk.md … **在る**
```

🚨 **「消すな」側だけが在って、「自分のは消せ」側が無かった。**
だから「消していいか分からない」が既定になり、**全員が置いていった**。

## 1. 決定（3 つを噛み合わせる。1 つでも欠けると壊れる）

| # | 決めること | これが無いと |
|---|---|---|
| ① | **他人のものは消さない**（既存の決定。**名乗りだけが持ち主を決める**） | 進行中の検証を消す |
| ② | **自分の台が作ったものは、自分が id で消す** | 誰も消さない（今回） |
| ③ | 🚨 **常設 fixture（`acc-*` など）は、そもそも②の対象外** | **次の人が数百行を「掃除」しに行く** |

🚨 **③が特に要る。** 台が作った行と常設 fixture は、**見た目で区別が付かない**
（どちらも `@example.com` の使い捨てに見える）。**区別できるのは、作った本人だけ**。

## 2. 🚨 `dev-login` は「ログインする道具」の顔をして、利用者を作る

【引いた】`apps/studio/app/api/auth/dev-login/route.ts`

```
47  async function upsertDevUser(email) {
49    .select("id","email","status")
50    .where({ email })          ← 🚨 **同じ email なら既存の行を再利用する**
55-56 在れば status/last_access を update するだけ
61    await db("directus_users").insert({ … })   ← 🚨 **無ければ作る**
```

🚨 **＝ 行が増える原因は「email が毎回変わること」だけ**（末尾に時刻を混ぜている台）。
**email が固定なら、何回叩いても行は増えない。**

✅ **したがって、いちばん強い後始末は「消す」ではなく「作らない」**
（email を固定にする）。**前提が要らなければ、前提が崩れても壊れない。**

## 3. 🚨 消す口は HTTP に無い（DB を直に触ることになる）

【引いた】`apps/studio/app/api/users/route.ts` … **`export async function GET` の 1 つだけ**
（🟢 対照 `DELETE` を持つ route は **15 本**在る ＝ この探し方は「在り」も出せる）

🚨 **後始末のために `DELETE /api/users` を作らない。** 権限の設計に踏み込む口を、
掃除の都合で開けることになる。**DB を直に撃つ**か、**②のように作らない形にする**。

## 4. 手順（**作る前 → 作った後**）

```bash
# 作る前: 共有 DB へ書くので予告する（1 行・窓 60〜120 秒）
# 作った後: 🚨 id を控える。dev-login の応答は data.userId を返す

# 消す（🚨 id で撃つ。email・名前・ラベルで撃たない）
docker exec ohmycms-db psql -U cms -d cms -At -c \
  "delete from directus_sessions where \"user\" in ('<id1>','<id2>');"
docker exec ohmycms-db psql -U cms -d cms -At -c \
  "delete from directus_users where id in ('<id1>','<id2>');"

# 確認（🚨 総数では見ない）
#   ① 自分の id が 0 件
#   ② 🟢 触っていない id が 1 件（＝ 撃ちすぎていない）
#   ③ 総数は参考にしかならない
```

🚨 **`email` で撃たない理由**: 2026-08-16、対照のために既存利用者の email を書き換えた台が、
**その email を条件に delete して元の行を消した**。しかも
**「消した 1 ＋ 往復が作った 1」で総数が釣り合い、確認が緑のまま通った**。

🚨 **「id で撃つ」だけでは足りない。「id で確かめる」までが作法。**

## 5. 🚨 消し忘れは事故ではない。名乗らないことが事故

- 共有 DB の行に **git のような履歴は無い**。**誰が作ったかは、どこにも書かれていない**
  （このリポジトリでは git の author すら全員同じなので、そちらも手がかりにならない）
- ＝ **名乗りだけが持ち主を決められる**。名乗りが無い行は、**誰も消せない**（①より）
- 🚨 今回、3 回聞かれるまで名乗らなかった側の理由は **「心当たりが無いと思っていた」**
  → **確かめずに「無い」と思っていた**。**台本を引けば 1 分で分かった**

✅ **心当たりを聞かれたら、記憶ではなく台本を引いて答える。**

## 6. アンチパターン

- ❌ 使い捨ての利用者を作る台に、後始末を**書かないまま**共有 DB へ向ける
- ❌ 後始末を **email / 名前 / ラベル**で撃つ（別人を消す）
- ❌ 後始末の確認を**総数の一致**でやる（打ち消し合って緑になる）
- ❌ 「持ち主不明だから」で**他人の行**を消す（①・[permanent-fixtures](./permanent-fixtures-are-not-junk.md)）
- ❌ 常設 fixture を「残骸」と呼んで掃除する（③）
- ❌ 掃除のために `DELETE /api/users` を新設する（§3）
- ❌ 心当たりを**記憶で**答える（§5）

## 7. レビュー観点

- [ ] その台は共有 DB に行を作るか（`dev-login` を呼んでいれば **作る**）
- [ ] email は固定か（時刻を混ぜていないか＝ **そもそも増やさない形か**）
- [ ] 作った id を控えているか（`data.userId`）
- [ ] 後始末は **id で撃ち**、**id で確かめて**いるか（総数ではないか）
- [ ] 消したのは **自分が作ったものだけ**か
- [ ] 常設 fixture を巻き込んでいないか
