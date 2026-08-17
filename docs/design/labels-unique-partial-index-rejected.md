# 採らなかった案: ラベルの一意制約を部分索引にする（2026-08-16）

> **結論: 採らない。** 一意制約は `ohmycms_labels_name_unique` / `ohmycms_labels_system_key_unique` の
> ままにして、**消したラベルの名前は押さえ続ける**（司令塔の裁定・2026-08-16）。
> 素材として残す（`AGENTS.md` §8: 「調べた結果」なら `docs/`）。決定側は
> [`knowledge/decisions/`](../../knowledge/decisions/) と `apps/studio/scripts/audit-unique-vs-softdelete.ts` の `裁定済み`。

## 何を提案したか

論理削除（`deleted_at`）を入れたので、**消した行の名前が一意制約に押さえられたまま**になる。
そこで一意制約を**部分索引**に置き換える案を出した:

```sql
alter table ohmycms_labels drop constraint ohmycms_labels_name_unique;
create unique index ohmycms_labels_name_unique
  on ohmycms_labels (name) where deleted_at is null;
```

生きている行だけで一意になるので、**消した名前は空く**。

## なぜ採らなかったか

**名前を空けると、戻せなくなるから。**

```
ラベル A を消す（deleted_at が付く）
→ 名前が空くので、同じ名前で新しいラベル A' を作れる
→ 🚨 ゴミ箱から A を戻す（deleted_at = null）と、A' と衝突して**戻せない**
```

ゴミ箱の約束は「**戻すと全部戻る**」（設問290 A）なので、**この約束のほうが先**。
「戻せる」を保証するには、名前を押さえ続けるしかない。

**失敗が起きる場所も違う。**

| | 名前を押さえたまま（採用） | 部分索引（不採用） |
|---|---|---|
| 同じ名前で作ろうとしたとき | **その場で** `LABEL_EXISTS_TRASHED`「戻すか、完全に削除してください」 | 作れてしまう |
| ゴミ箱から戻すとき | 必ず戻せる | 🚨 **ここで初めて失敗する** |

🚨 **不採用案は、失敗が操作から離れた場所で起きる。**
作った本人は成功したと思い、**あとで別の人が「戻せない」に当たる**。

## 測ったこと（捨てないために残す）

使い捨ての postgres で、この migration を書いて実際に測った。**採否とは別に、測り方が残る。**

- 🟢 `up` → 両索引が `(deleted_at IS NULL)` の部分索引になり、`unique` 制約は 0 本
- 🟢 `down` → `(条件なし)` に戻り、`unique` 制約 2 本
- 🟢 `up` → また部分索引（1:1 で戻る）
- 振る舞い: 生きている行が 2 つ → `duplicate key` で弾かれる ／
  消してから同じ名前 → **作れる**（＝ これが望ましくなかった）／
  もう 1 回 → 弾かれる（生きている行とはちゃんと争う）

### 🚨 `down` は、データによっては通らない

消した行と生きている行で同じ名前ができていると、素の一意制約へ戻すときに
`could not create unique index` で落ちる（実測 exit 1）。
部分索引は素の制約より**緩い**ので、**戻すときだけ厳しくなる**。

🚨 **これは復元でも同じことが起きる**という意味でもある——
つまり「同じ名前が 2 つ在る状態を作れてしまう」こと自体が、この案の問題だった。

### 測り方でつまずいた 2 点

- 🚨 `migrate:rollback` は**バッチ全体**を戻す。44 本が 1 バッチだったので**表ごと消えた**。
  1 本だけ戻すのは `migrate:down`。
- 🚨 `pg_isready` が 1 回通っても、初期化中の postgres はそのあと落ちる。
  🚨 **ここに書いていた「3 回連続で通るまで待つ」は塞がらない**（2026-08-17 実測）。
  `docker exec` を 3 回打つと 1 回しか通らず塞いだように見えるが、**中で 1 回にまとめると
  3/5 で 3 回とも通る**——**塞いでいたのは述語ではなく `docker exec` の実費**だった。
  正しい待ち方と理由は
  [soft-deleted-permissions-must-not-grant](../../knowledge/decisions/soft-deleted-permissions-must-not-grant.md)
  の「なぜ嘘の ready が出るか」を見る。
- 🚨 判定を「`duplicate key` が**出ない**こと」で書いたので、
  **`relation does not exist` も「出ない」に入り、緑になった**。
  → `INSERT 0 1` との**完全一致**で判定し直した（[verify-the-verifier](../../knowledge/decisions/verify-the-verifier.md) の 10 番）。

## いま何が担保しているか

`apps/studio/scripts/audit-unique-vs-softdelete.ts` の `裁定済み` に、この 2 本を理由つきで登録した。
**未決の一意制約が新しく増えたときだけ** exit 1 になる。
＝ この裁定を知らない人が、逆向きに「直して」しまうのを止めるため。
