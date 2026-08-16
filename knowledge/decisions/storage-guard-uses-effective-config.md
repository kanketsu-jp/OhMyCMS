---
type: decision
title: 保管先の安全装置は「実装が実際に使う値」で判定する
description: 検証ハーネスの守りが環境変数を見ていたが、実装は DB を優先して解決するため、守りが「安全」と言ったまま別のバケットへ書ける状態だった。判定を getStorageStatus() から取り、本番のバケット名なら無条件で落とし、検証用は別名（ohmycms-verify）にする。
tags: [architecture, files, ops, security]
status: active
generated:
  by: storage
  at: 2026-08-15
verified: []
sources:
  - resource: "repo://apps/studio/scripts/s3-guard.ts"
  - resource: "repo://apps/studio/scripts/verify-s3-storage.ts"
  - resource: "repo://apps/studio/lib/settings/service.ts"
  - resource: "repo://apps/studio/lib/storage/index.ts"
---

## 決定

1. **保管先へ書き込む検証は、書く前に「実装が実際に使う値」で安全確認する。**
   判定の入力は `getStorageStatus()`（＝`lib/storage` が実際に解決した driver / bucket / endpointHost）。
   🚨 **環境変数を直接見ない。**
2. **本番のバケット名（`ohmycms`）が解決されたら、無条件で落とす。**
   🚨 **`--allow-remote` でも通さない。**
3. **検証用のバケットは別名（`ohmycms-verify`）にする。**
   🚨 **同じ名前にして、エンドポイントだけで見分ける設計はやめた。**
4. **判定は副作用のない別モジュール（`scripts/s3-guard.ts`）に置く。**

## なぜ（2026-08-15 に実際に起きたこと）

### 守りが見る値と、書き込む先が別々だった

```
守り: process.env.S3_ENDPOINT を見て「ローカルだから安全」と判断
実装: getSettings() 経由で **DB を優先**して解決（lib/settings/service.ts の getSettings() 内 resolve()）
```

**共有設定に `s3_bucket = "xx"` が残っており、環境変数に勝っていた。**
守りは「ローカルだから安全」と言ったまま、**実装は別のバケットへ向いていた**。

🚨 **落ちたのは、`"xx"` が S3 の規則（3文字以上）に反していたからにすぎない。**
**実在する名前が入っていたら、そのバケットへ書いて消していた**
（このハーネスは `put` / `delete` / `deletePrefix` を実行する）。

### なぜ気づかなかったか

**共有環境は全部ローカル FS なので、S3 の経路は一度も踏まれていなかった。**
🚨 **一度も使われていない非常口は、未検証である。**

### 同じ名前で見分ける設計が、そもそもの弱点だった

以前の守りのコメント自身がこう書いていた:

> 本番は R2 を使っていて、**バケット名が検証用と同じ `ohmycms`** なので、
> `S3_ENDPOINT` を差し替えたまま実行すると**本番のデータを触る**。

**「同じ名前だから、別の手掛かりで見分ける」**という構造が、
**その手掛かりが変わった瞬間に破れた**。**名前を分ければ、この破れ方はしない。**

## 知っておくこと

🚨 **設定は DB が環境変数に勝つ**（`lib/settings/service.ts` の `getSettings()` の中の
`resolve()`。**DB に文字列が在ればそれ、無ければ env、無ければ既定値**）。

🚨 **行番号で指さない**（2026-08-16）。この文書は当初 `service.ts:229` と書いていたが、
**同じ日のうちに 229 行は別のもの（`resolve` の宣言の途中）になっていた**。
**関数名とコメントの原文で指す**（動かないもので指す）。
**したがって、共有設定に残った値は全員に効く。**
環境変数で検証しようとしても、**DB に値があれば無視される**。

🚨 **環境変数の受け皿は `lib/storage` ではなく `lib/settings/service.ts` の `fromEnvironment()` にある**
（`S3_ENDPOINT` / `S3_BUCKET` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` /
`S3_FORCE_PATH_STYLE` / `S3_KEY_PREFIX` の 7 つ）。
**`lib/storage` だけを見て「環境変数を読んでいない」と結論しないこと**
（2026-08-15 に私がそう誤報し、全員へ緊急連絡を出した）。

## 測り方（RED / GREEN）

```
🚨 RED  実装が本番の名前を解決する状態にして走らせる
  S3_ENDPOINT=http://localhost:3106 S3_BUCKET=ohmycms … bun run verify:s3
  → 書き込み先の確認: driver=s3 bucket=ohmycms host=localhost:3106
  → 🚨 書き込む前に止めました（無条件で止めます）  exit=2
  → **PASS の数 0 件**（＝書き込みの判定に一度も到達していない）
     🚨 exit だけでは「書く前」の証拠にならない。**書き込み側の出力が 0 件**まで見る

🟢 GREEN 検証用の名前
  S3_BUCKET=ohmycms-verify … → ✅ 書き込んでよい → PASS が出て先へ進む
```

## やらないこと

- ❌ 本番の R2 バケット `ohmycms` に対して検証ハーネスを走らせる（オーナーの恒久指示）
- ❌ 守りを環境変数で判定する形へ戻す
- ❌ 検証用と本番で同じバケット名を使う
- ❌ 計測のために共有設定を書き換えて、戻さない
  （2026-08-15 に実際に起きた。**計測は読むだけとは限らない**）

## 関連

- [保管先のキー設計を固定する](./storage-key-prefix-is-fixed.md)（`S3_KEY_PREFIX` を変えると既存ファイルが迷子になる）
- [秘密の置き場所](./secrets-storage-by-recoverability.md)（DB 優先へ反転した経緯）
