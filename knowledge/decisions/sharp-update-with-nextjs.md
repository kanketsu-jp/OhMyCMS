---
type: decision
title: sharp の脆弱性は Next.js の更新を待って解消する
description: 直接依存の sharp は 0.35.3 だが、Next.js 16.2.12 が内部依存として sharp 0.34.5 を持つ。依存を上書きせず、Next.js の更新時に内部版を確認する。
tags: [security, dependencies, nextjs, sharp]
status: active
generated:
  by: agent
  at: 2026-08-19
verified: []
sources:
  - resource: "repo://apps/studio/package.json"
  - resource: "repo://bun.lock"
  - resource: "repo://.temp/2026-08-18/spec-348-sharp-decision.md"
stale_after: 2027-02-19
x_rag_okf:
  id: decisions/sharp-update-with-nextjs
  authorship: agent
---

# sharp の脆弱性は Next.js の更新を待って解消する

## 背景

2026-08-19 に、リポジトリの宣言・Bun lockfile・インストール済み依存ツリーを確認した。

- 直接の依存は `apps/studio/package.json` の `sharp: ^0.35.3` であり、`bun.lock` でも `sharp@0.35.3` になっている。
- Next.js は `16.2.12` で、`bun.lock` の `next` の optional dependency とインストール済み依存ツリーでは内部の `sharp@0.34.5` が確認できる。
- Directus も直接使っている版は `0.35.3` である（司令塔が実物で確認済み）。
- 攻撃できるのは自分のサイトに載っている画像に限られ、影響範囲は狭い。

## 決定

sharp の脆弱性は、**Next.js の更新を待って解消する**。Next.js が内部で持つ依存を、プロジェクト側で上書きしない。

## なぜ待つか

依存を上書きすると、Next.js が想定していない `sharp` の組み合わせになる。Next.js 側が対応版を取り込んだ更新を待つことで、Next.js と内部依存の組み合わせを保つ。

## 見直し条件

**Next.js を上げたときに、この決定を確かめる。** その時点の lockfile とインストール済み依存ツリーで、Next.js 内部の `sharp` が **0.35 以上**になったかを見る。

- 0.35 以上になっていたら、この決定の対象は解消済みとして決定文書を「直った」状態に更新する。
- 0.34.5 のままなら、依存の上書きはせず、この決定を継続する。
