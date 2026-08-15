# 初回起動の環境を立てる — 共有環境では誰も到達できない経路を踏むために

> 2026-08-15 onboard が作成。**きっかけは、この形で1日壊れていたこと**（下記）。
> **宛先は特定の担当ではない。** Docker と bun が動く人なら誰でも使える。
> 🚨 **共有（:3101 / :3102 / :3103 / :5436）には一切触らない手順**にしてある。

## 0. なぜ要るか

`7b923d9`（2026-08-15 09:41）が**フォームからだけ** `tenant_name` を外し、API 側の必須検証を
そのまま残した。結果、**「はじめる」も「あとで」も 400** になり、
**新規インストールでは初期設定を一度も終えられない**状態になった。

**発見は 20:0x。約 10 時間、誰も踏まなかった。**

踏めなかった理由が本題:

```
:3101 / :3102 / :3103 は どれも onboarding_completed_at が入っている（2026-08-13）
  → /onboarding は 307 で /admin へ飛ぶ
  → **共有環境では、誰もこの画面に到達できない**
Storybook の story は **API に届かない**（送信は必ず失敗するので、成功経路が測れない）
```

🚨 **「見ていない 0」の環境版。** 人が踏めない経路は、踏める環境を作らないと永久に測れない。

## 1. 立てる（実測 16 秒で 200 まで来る）

```bash
REPO=/Users/horiikekazuma/Develop/Projects/kk2/cms
WT=$REPO-probe-onboard          # 🚨 リポジトリの外ではなく「隣」。同じボリュームに置くこと（§5-1）

# ① 使い捨ての Postgres（🚨 共有の :5436 ではなく :5437）
docker run -d --name ohmycms-onboard-probe \
  -e POSTGRES_USER=cms -e POSTGRES_PASSWORD=cms -e POSTGRES_DB=cms \
  -p 5437:5432 postgres:17
until docker exec ohmycms-onboard-probe pg_isready -U cms; do sleep 1; done

# ② 作業ツリーを分ける（🚨 .next を共有すると :3102 を壊す）
git -C "$REPO" worktree add "$WT" HEAD --detach
printf 'DATABASE_URL=postgres://cms:cms@localhost:5437/cms\nALLOW_DEV_LOGIN=1\n' \
  > "$WT/apps/studio/.env.local"

# ③ 依存とスキーマ
(cd "$WT" && bun install --frozen-lockfile)
(cd "$WT/apps/studio" && bun run migrate)          # 40 本

# ④ 開発サーバ（🚨 3110 は「worktree の開発サーバ 1 本目」＝ port-allocation の決定）
(cd "$WT/apps/studio" && nohup bun x next dev --port 3110 > /tmp/dev3110.log 2>&1 &)
```

**OTP（`OtpLoginForm`）も出したいときは、④ の前に env を足す。**
🚨 **DB には何も書かない**——`mailConfig()` は `DB → env` の順に解決するので、
**env だけで `/login` に OTP のフォームが出る**（値は偽物で構わない。描画を見るだけなら送信しない）。

```bash
export OHMYCMS_BUGREPORT_TO=probe@example.test SMTP_FROM=probe@example.test \
       SMTP_HOST=localhost SMTP_PORT=1025 SMTP_USER=probe SMTP_PASSWORD=probe
```

## 2. 🚨 測る前に、2 つ確かめる

**どちらも、飛ばすと「別のものを測った結果」を自分の結果として報告することになる。**

### 2-1. 本当に初回状態か

```bash
docker exec ohmycms-onboard-probe psql -U cms -d cms -At \
  -c "select count(*) from ohmycms_settings where onboarding_completed_at is not null;"
# → 0 なら初回。1 以上なら /onboarding は 307 になり、**共有環境と同じ状態**（意味がない）
```

### 2-2. 🚨 :3110 を掴んでいるのが「いま立てたサーバ」か

**実際に踏んだ**（2026-08-15）: 削除したはずのワークツリーの `next dev` が生き残って :3110 を掴んでおり、
**新しい起動は EADDRINUSE で死んでいたのに、:3110 は 200 を返し続けていた**。
そのまま測れば、**削除済みのコードの結果**を自分の結果として出していた。

```bash
PID=$(lsof -nP -iTCP:3110 -sTCP:LISTEN | awk 'NR==2{print $2}')
lsof -p "$PID" -a -d cwd -Fn | grep '^n'
# → n/Users/.../cms-probe-onboard/apps/studio であること
```

🚨 **「200 が返る」は「測りたいものが動いている」ではない。**
ブラウザで測るなら、あわせて計測の1行目に `console.log(await page.where())`
（`scripts/headless-browser.mjs`。**status が数値か文字列か**で接続不可を判別できる）。

## 3. 初回起動でしか通れない経路（2026-08-15 時点で 4 本・全部通した）

| # | 経路 | 合格の形 | 通し方の要点 |
|---|---|---|---|
| 1 | `/onboarding` の描画 | `where()` が `status=200`、器が `max-w-sm`(384px) | setup セッションが要る（§4） |
| 2 | 初期設定の完了（両ボタン） | 「あとで」「はじめる」とも **200** | 🚨 **両方**測る。片方だけだと 2026-08-15 の穴を見逃す |
| 3 | 完了画面の行き先 | `/admin/settings/general` へ **押して 200** | 🚨 **押すまで生きているか分からない** |
| 4 | 409 の文言 | 「初期設定はすでに完了しています…」が**画面に出る** | §4-2 の手順（普通には作れない） |

**ついでに取れるもの**: `directus_sessions.auth_method = 'onboarding'`
（この経路でしか入らない。対照に `setup` を並べると「定数ではない」ことまで示せる）。

## 4. 通し方のうち、素直にはできない 2 つ

### 4-1. setup セッションを取る

`/onboarding` は未認証だと `/login` へ 307。**ブラウザ自身に取らせる**とトークンを外へ出さずに済む。

```js
await page.goto(`${ORIGIN}/login`);
await page.eval(`(async()=>{const r=await fetch("/api/auth/setup",{method:"POST",
  headers:{"content-type":"application/json"},body:JSON.stringify({password:"pass132"})});return r.status})()`);
// → 200（OHMYCMS_SETUP_PASSWORD 未設定なので既定の pass132）
```

### 4-2. 409 を画面に出す

完了後は `/onboarding` が 307 になるので、**フォームを開いたままにはできない**。
🚨 **フォームを先に開いておき、別の経路で完了させてから押す。**

```
① /onboarding を開いてステップ2 まで進める（フォームは生きている）
② 同じページから fetch で setup → /api/onboarding を叩き、**先に完了させる**
③ 画面の「はじめる」を押す → 409 → 文言が出る
🟢 対照: ②の前に文言が出ていないことを確認しておく（出ていたら別の理由）
```

## 5. 落とし穴（全部、実際に踏んだ）

1. **ワークツリーを `/private/tmp` に置くと Turbopack が死ぬ**
   `Symlink ... is invalid, it points out of the filesystem root`。
   `node_modules` を symlink で借りる手も同じ理由で不可。**隣に置いて `bun install` する**（実測 2 秒）。
2. **`.next` を共有すると :3102 を壊す**。worktree を分ける理由はこれ。
3. **一時ファイルをリポジトリの中に置かない**。
   `i18n` と `audit-coverage` は **staged ではなく作業ツリー全体**を見るので、
   **未追跡のまま置いてあるだけで全員のコミットが止まる**（2026-08-15 に発生）。
   計測スクリプトは scratchpad（リポジトリ外）へ。
4. **`/tmp/xxx.txt` は他のペインと名前が衝突する**。実際に他人の出力を自分の結果として読みかけた。
   **出力は自分の scratchpad へ、実行ごとに違う名前で。**
5. **`grep -c` と `|| echo` を使わない**（0 件で exit 1 になり、`||` が誤発火する）。
   `> file; echo "exit=$?"; wc -l < file` の形にする。

## 6. 落とす（🚨 対照つきで確かめる）

```bash
PID=$(lsof -nP -iTCP:3110 -sTCP:LISTEN | awk 'NR==2{print $2}'); [ -n "$PID" ] && kill -TERM "$PID"
docker rm -f ohmycms-onboard-probe
git -C "$REPO" worktree remove --force "$WT"

curl -sS -o /dev/null -w ":3110 => %{http_code}\n" http://localhost:3110/login   # 000 = 落ちた
curl -sS -o /dev/null -w ":3102 => %{http_code}\n" http://localhost:3102/login   # 🟢 対照(+) 200 = 共有は無事
docker ps --filter 'name=ohmycms-db' --format '{{.Names}}'                        # 共有 DB が生きていること
git -C "$REPO" status --porcelain                                                 # 自分の痕跡が無いこと
```

🚨 **`000` だけでは「落ちた」と「測っていない」が区別できない。** 必ず対照(+) を並べる。

## 7. 実測した所要時間（2026-08-15 / HEAD 7966423 / このPC）

| 段 | 累計 |
|---|---|
| ① docker run + pg 応答 | 4s |
| ② worktree add | 4s |
| ③ bun install | 6s |
| ④ migrate（40 本） | 6s |
| ⑤ `/login` が 200 | **16s** |
| ⑥ 初回状態と素性の確認 | 16s |
| ⑦ 経路を 3 本通す | 26s |
| ⑧ 片付け | **34s** |

🚨 **温まっている前提**での数字。**次は含まれていない**:
- `postgres:17` の **image pull**（このPCでは取得済み）
- **bun の store が冷えている場合の `bun install`**（ここでは 2 秒）

## 8. どこで走らせるか（判断 → **決着済み**）

> 🚨 **2026-08-16 追記: (a) を採り、実際に載せました。**
> **`acceptance/checks/v1-e-first-run.mjs` ／ 項目 14「V1-E 初回起動」（`be350fa`）。**
> 走らせ方: `node acceptance/run.mjs --v1 --only 14`
>
> **以下は当時の判断の記録**です（**なぜ (a) にしたか**が要るので残す）。
> **もう「勧める」段階ではありません。** ここを読んで「まだ載っていない」と受け取らないでください。
>
> 載せたあとに分かったこと:
> ```
> 1 回あたり **15〜24 秒**（§7 の 34 秒は、経路を通して片付けるまでを含んだ値）
> RED も実測済み: 退行を再現したコミットを指すと **exit=1** で、2026-08-15 の 400 を名指しする
> 🚨 **まだ決まっていないのは「受入ハーネス自体を誰がいつ回すか」**。
>    そこが決まらない限り、載せただけでは §8 の懸念（誰も回さない）は消えていない
> ```

**当時の推奨: (a) 受入ハーネスに載せる。**

**理由は 1 つだけ**——🚨 **今日の穴は「重かったから」ではなく「誰も回さなかったから」** 生まれた。
そして**回すのに 34 秒**しかかからない（§7 実測）。**「重いから人が回す」の前提が成り立たない。**

載せるときの前提（**満たせないなら (b)**）:

```
・Docker が使えること
・:3110 と :5437 が空いていること
・🚨 **同時に 2 本走らせない**（ポートとコンテナ名を固定しているため）
  → 並列で回す必要が出たら、ポートとコンテナ名を引数にする
```

**(b) 昇格の前に1回** を選ぶ場合は、**司令塔の autopilot に入れる**。
**(c) 手順書のまま** は勧めない。**どうしても (c) にするなら、下を必ず埋めること**:

```
① 記録   2026-08-15
② 状態   未決（どこで走らせるか決まっていない）
③ 回す人 （空欄のまま運用しない。名前を入れる）
④ いつ   （「必要なときに」は不可。**リリース前・週次など、外から見て来る時点**を書く）
```

🚨 **③④ が空の (c) は、今日と同じ結果になる**——**誰も回さないので、壊れても気づかない。**
