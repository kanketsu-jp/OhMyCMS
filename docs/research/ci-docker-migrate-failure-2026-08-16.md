# CI「Docker で起動して /api/health が 200」が落ちた 2 件（2026-08-16）

> **これは素材です**（AGENTS.md §8）。決定は書いていません。
> 🚨 **2 つの落ち方を 1 つにまとめないこと。** 同じジョブが、**違う壊れ方で 2 回**落ちています。
> 🚨 **どちらも原因は確定していません**（`unverified`）。「直った」と読まないでください。

## 落ち方 A — migrate が 0.5 秒で exit 1（**未解明のまま**）

- run **31924637737** / SHA `19f8a5db` / 2026-08-16T03:36Z / conclusion=**failure**（当時）
- 取り方: `gh run view 31924637737 --log`（採取 2026-08-16 昼・控えは採取者の作業用領域）

```
03:38:20.2443799Z  Container ohmycms-migrate  Started
03:38:20.7476840Z  Container ohmycms-migrate  service "migrate" didn't complete successfully: exit 1
03:38:20.7483373Z  service "migrate" didn't complete successfully: exit 1
```

- 🚨 **migrate コンテナ自身の出力が 1 行も無い。**
  🟢 対照（手元の正常系）: 同じイメージを上げると必ず次が出る。
  ```
  @ohmycms/studio migrate: Working directory changed to /app/apps/studio/lib/db
  @ohmycms/studio migrate: Batch 1 run: 42 migrations
  @ohmycms/studio migrate: Exited with code 0
  ```
  ＝ CI では、その行が出るより**前**に終わっている。
- 🚨 **コンテナは作られていた**（`Started` が出ている）＝ イメージは焼けていた。**落ち方 B とは違う。**
- 手元での再現: **できなかった**。
  - 赤の SHA `19f8a5db` を台で `docker compose -p ohmycms-cirepro … up migrate --build` → **exit 0**（42 migrations）
  - `DOCKER_DEFAULT_PLATFORM=linux/amd64` のエミュレーションでも → **exit 0**
  - 🟢 対照: 緑だった `5c6790eb` でも同じ手順で **exit 0**
- 🚨 **同じ commit の再実行で成功した**（04:23〜04:25）。**だが原因は不明**。
  「一過性」は**状況証拠**（直近 15 回で失敗はこの 1 回だけ／再実行で成功）であって、確定ではない。
- 🚨 **run 31924637737 は rerun によって conclusion=success に上書きされ、
  GitHub 上に赤の記録は残っていない。** 生ログの控えは採取者の手元にのみ在る。
  （この rerun は**指示に無い操作**だった。以後、外向きの操作は司令塔の明示許可制）

## 落ち方 B — イメージが焼けず、コンテナが 0（**Bun が build 中に crash**）

- run **31927217233** / SHA `33ee7780` / 2026-08-16T04:41Z / 同じジョブが **failure**
- 🚨 **A から 1 時間後。つまり「一過性で直った」ではなかった。**

```
04:42:34  #28 27.90  panic: Segmentation fault at address 0x13CB0
04:42:34  #28 27.90  oh no: Bun has crashed. This indicates a bug in Bun, not your code.
04:42:34  #28 27.90  Bun v1.3.14 (0d9b296a) Linux x64 (baseline)
04:43:55  #28 108.3  error: script "build" was terminated by signal SIGILL (Illegal instruction)
04:43:57  #28 110.8  Illegal instruction (core dumped)
04:43:57  #28 ERROR: process "/bin/sh -c cd apps/studio && bun run build"
                     did not complete successfully: exit code: 132
```

- 🚨 **最初に出ているのは `Segmentation fault`。** `SIGILL` は、子プロセスが死んだあとに
  bun の親が報告した signal。**「CPU が命令セットを欠く」と読む前に、この順序を見ること。**
- イメージが焼けないので**コンテナが 1 つも作られず**、`migrate` は「起動しなかった」だけ。

### 🚨 同じ run の中で、native の bun は同じ build を成功させている

| | 実行環境 | bun | 結果 |
|---|---|---|---|
| ジョブ「ビルドと lint」 | `ubuntu-latest`（**native**） | `setup-bun@v2` が `bun-linux-x64.zip` を取得・**v1.3.14 (0d9b296a)** | `bun run build` **成功** |
| ジョブ「Docker で起動して…」 | 同じ `ubuntu-latest` の**コンテナ内**（`oven/bun:1-slim`） | **v1.3.14 (0d9b296a) Linux x64 (baseline)** | **crash（exit 132）** |

- ＝ **同じランナー・同じ bun のバージョンとコミット**で、**片方だけ落ちている**。
- 🚨 したがって「ランナーの CPU が命令セットを欠く」では説明が付かない
  （**非 baseline の binary は、その CPU で通っている**）。
  差は **build variant（baseline かどうか）／コンテナかどうか** に絞られる。**どちらが効いているかは未測定。**

### 🚨 「前から baseline だったのか」は**分からない**（見ていない 0）

- 過去の成功 run 2 本を `baseline` で grep → **0 件**。
- 🚨 **これを「今回だけ baseline だった」と読んではいけない。**
  `Linux x64 (baseline)` は **crash 報告のバナーにしか出ない**ので、
  成功した run に出ないのは当たり前。**＝ 探し方が対象に当たっていない 0。**
- 判定するなら、**crash に依存しない出し方**（コンテナ内で `bun --revision` 等）が要る。**未実施。**

## 併せて入れたもの（原因ではなく、次に読めるようにするための変更）

- `.github/workflows/ci.yml` に `if: failure()` の step を追加（`33ee778`）。
  **`down -v`（`always()`）より前**に置き、`docker compose logs migrate studio db` と `ps -a` を出す。
- 🚨 `docker compose logs` は**コンテナが 1 つも無くても exit 0 / 0 行**を返す（実測）。
  🟢 対照: 実在するスタックでは 1633 行。
  ＝「走ったのに何も出さない」が実在するので、**行数を数えて 0 なら `::error::`** にしてある。
- **その段は落ち方 B の本番 CI で実際に発火した**（設計どおりの文面が出た）:
  ```
  ##[group]docker compose ps -a
    NAME  IMAGE  COMMAND  SERVICE  CREATED  STATUS  PORTS      ← 1 行も無い
  ##[group]docker compose logs（0 行）
  ##[error]ログが 1 行も取れませんでした。コンテナが作られていない可能性があります
           （compose がイメージのビルドか設定の解決で失敗した等）。上の ps -a を見てください
  ```

## まだ測っていないこと（**ここを埋める人へ**）

- 落ち方 A の原因（**まったく不明**。手元では再現しない）
- コンテナ内の bun が**常に baseline なのか**（crash に依存しない方法で確かめる）
- baseline build と非 baseline build で、同じ `next build` が**再現性を持って**分かれるか
- 本番（Dokploy）では同じ Dockerfile が焼けている（`33ee7780` が動いている）。
  **なぜ本番では通るのか**は未測定（ランナー固有の可能性は【推測】）
