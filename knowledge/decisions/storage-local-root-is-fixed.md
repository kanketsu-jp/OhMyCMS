---
type: decision
title: 保管先の根（STORAGE_LOCAL_ROOT）は環境変数に残す（GUI へ移さない）
description: 毎回の要求で読んでいるので技術的には GUI へ移せるが、変えた瞬間に既存ファイルが全部読めなくなる。しかも DB の行は残るため一覧には並び、開こうとして初めて落ちる。理由は「起動時に要るから」ではなく「変えさせないため」。
tags: [architecture, files, ops]
status: active
generated:
  by: storage
  at: 2026-08-16
verified: []
sources:
  - resource: "repo://apps/studio/lib/storage/local.ts"
  - resource: "repo://knowledge/decisions/storage-key-prefix-is-fixed.md"
---

## 決定

**`STORAGE_LOCAL_ROOT` は環境変数のままにする。GUI（設定画面）へ移さない。**

🚨 **理由は「起動時に要るから」ではない。「変えさせないため」。**

## なぜ（2026-08-16 の実測）

### ①「要求のたびに読めるか」だけを見ると、移せてしまう

```
lib/storage/local.ts  function storageRoot() { … process.env.STORAGE_LOCAL_ROOT ?? ".storage" }
＝ 毎回呼ばれる関数の中で読んでいる（起動時に 1 回ではない）
```

**この条件だけなら「移せる」と判定される。** 実際そう見える形をしている。

### ② 変えると、既存のファイルが全部読めなくなる

```
🟢 A に置いて A で読む             … 読めた
🚨 保管先を B に変えて同じキーを読む … 例外 ENOENT: no such file or directory
🟢 対照(+) A に戻すと              … 読めた
```

🚨 **壊れ方が静か。**
**DB の行は残る**ので、**一覧にはファイルが並ぶ**。開こうとして初めて落ちる。
**消えたようには見えない。**

管理者が設定画面で 1 文字直しただけで、この状態になる。

## 同じ性質のもの

- [保管先のキー設計を固定する](./storage-key-prefix-is-fixed.md)
  （`S3_KEY_PREFIX` を後から変えると、既存ファイルが迷子になる）

🚨 **根も接頭辞も「保存したときの場所と一致していなければならない値」で、性質は同じ。**
**片方だけ GUI にすると決定が割れ、片方が腐る。**

## 判断のしかた（他の環境変数にも使う）

```
① 要求のたびに DB から読めるか
   読めない → env に残す。理由「起動時に要るから」
🚨 ② 読めても、利用者に変えさせてはいけないなら env に残す
      （＝ 外部サービスや既存データと一致していなければならないもの）
      理由は「変えさせないため」と書く
```

🚨 **理由を取り違えると、次の人が「毎回読んでいるから移せる」と言って移す。**
**①だけで判定した結果が、この文書が在る理由。**

## やらないこと

- ❌ `STORAGE_LOCAL_ROOT` を `ohmycms_settings` へ移す
- ❌ 「毎回読んでいるから移せる」を理由に移す
- ❌ この決定を `storage-key-prefix-is-fixed.md` と別の方針にする

## この決定が答えないこと

- 🚨 **既に保管先を変えてしまった環境の直し方**は書いていない
  （実体を移すか、DB の行を消すかの判断が要る。起きたら決める）
- 🚨 **S3 側の同等物**（バケットやエンドポイントの変更）は
  [storage-guard-uses-effective-config](./storage-guard-uses-effective-config.md) 側の話
