---
type: decision
title: ポートは 31xx 帯に寄せ、よく使うポートを避ける
description: 既定が 3000 だと他プロジェクトの開発サーバと必ず衝突する。OhMyCMS の待ち受けを 31xx 帯に固定し、用途ごとに番号を決めた。
tags: [ops, ci, architecture]
status: active
generated:
  by: rag-okf
  at: 2026-08-13
verified: []
sources:
  - resource: "repo://.env.example"
  - resource: "repo://compose.yml"
  - resource: "repo://acceptance/run.mjs"
stale_after: 2027-02-13
x_rag_okf:
  id: decisions/port-allocation
  authorship: agent
---

# ポートは 31xx 帯に寄せ、よく使うポートを避ける

## 背景

> 堀池（2026-08-13）: 「**OhMyCMS はよく使うポートを避けます。なので、3101 など
> なにかルールを作って。**」

**3000 は Next.js の既定**なので、開発機で他のプロジェクトを同時に動かすと必ず取り合う。
実際に踏んだ:

- 受入ハーネスと本番スタックが同じポートを掴んで、ハーネスが誤って FAIL した
  （→ `DOCKER_PORT` を 3998 に分離して回避したが、**その場しのぎだった**）
- 管理画面が全ページ 500 になる事故。原因は `requestOrigin()` が host ヘッダから
  自分の URL を組み立てるため、**公開ポート ≠ コンテナ内ポート**だと壊れる

🚨 **後者が効く。** 「衝突したら別のポートに逃がす」を場当たりでやると、
**公開ポートとコンテナ内ポートがずれて、原因の分かりにくい 500 を生む。**

## 決定

> 基準日: 2026-08-13

**OhMyCMS が待ち受けるポートは 31xx 帯に固定する。用途ごとに番号を決め打ちする。**

| 用途 | ポート | 環境変数 |
|---|---|---|
| **Studio（本番 / Docker）** | **3101** | `STUDIO_PORT` |
| **Studio（開発 / `bun run dev`）** | **3102** | — |
| **受入ハーネス（`ohmycms-studio-acc`）** | **3103** | `DOCKER_PORT` |
| **Storybook** | **3104** | — |
| PostgreSQL | **5436**（既存を維持） | `DB_PORT` |

**3105 以降は将来のプロセス用に空けておく**（Hono へ API を分離したときなど）。

### 避ける番号（使わない）

`3000`（Next.js 既定）/ `3001` / `5432`（Postgres 既定）/ `8080` / `8000` / `5173`（Vite）/ `6006`（Storybook 既定）

## 理由

**「空いているポートを探す」のではなく「最初から衝突しない帯に置く」。**
探す方式は、探した時点では空いていても**次に別のプロジェクトを起動すると取られる**。

31xx 帯を選んだのは、**主要なツールの既定値が入っていない**ため
（3000 番台の先頭は Next.js / Rails などが使うが、3100 以降はほぼ空いている）。

## 影響

- 🚨 **コンテナ内のポートは変えない。** 変えるのは**ホスト側の公開ポートだけ**。
  コンテナ内は 3000 のままにする（`requestOrigin()` の事故を再発させないため）
- `.env.example` の `STUDIO_PORT` を 3101 にする。`.env` を持っている人は各自で直す
- `acceptance/run.mjs` の `DOCKER_PORT` を 3103 にする
- README / AGENTS.md §5 のコマンドインデックスの URL を書き換える
- 🚨 **ハーネスと本番スタックのポートが別であること自体は維持する。**
  同じにすると[[shared-resources-are-exclusive]]の事故が復活する

## 教訓

**ポートは「共有資源」の一種。** 早い者勝ちで取ると、後から来たプロセスが黙って壊れる。
資源は**先に割り当てを決めてから使う**。

## 関連

[[shared-resources-are-exclusive]]
