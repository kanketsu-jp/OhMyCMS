/**
 * headless Chrome を CDP（Chrome DevTools Protocol）で動かす最小のドライバ。
 *
 * 🚨 **なぜこれが要るか。** `AGENTS.md §4` は「curl でソースが取れた」を表示確認と呼ぶな、と
 *    決めている。しかし 2026-08-15 時点で**ブラウザを触る手段が全部使えなくなった**:
 *      - `claude-in-chrome` 拡張 … `Browser extension is not connected` のまま復帰しない
 *      - `terminal-browser`      … tmux の下では自分のペインを見つけられない
 *    このままだと全ペインが「表示確認をしていないのに完了と報告する」に流れる。
 *    → Chrome を headless で立てて CDP を直接叩く。**描画された DOM を測れる**ので、
 *      `getComputedStyle`・実寸・クリック・キー入力まで curl の代わりになる。
 *
 * 依存は無い（Node 22+ の組み込み `WebSocket` と `fetch` だけ）。
 *
 * ## 使い方
 * ```
 * # 1) Chrome を立てる（1回だけ。落ちていたら立て直す）
 * "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
 *   --remote-debugging-port=9333 --user-data-dir=/tmp/ohmycms-headless \
 *   --no-first-run --no-default-browser-check about:blank &
 *
 * # 2) 検証スクリプトから使う
 * import { open } from "./headless-browser.mjs";
 * const page = await open();
 * await page.goto("http://localhost:3102/login");
 * console.log(await page.where()); // 🚨 測定の1行目でこれを出す（落とし穴5）
 * await page.setCookie("ohmycms_locale", "ja", "http://localhost:3102");
 * await page.goto("http://localhost:3102/admin/collections");
 * console.log(await page.eval(`document.querySelectorAll("header").length`));
 * await page.closeTab(); // 検証スクリプトの最後は必ずこれ（落とし穴2・6）
 * process.exit(0);
 * ```
 *
 * 🚨🚨 **落とし穴12: `process.exit(0)` を書き忘れると「固まった」ように見える**
 * （2026-08-16・onboard が 2 回踏んだ）。**上の 2 行は飾りではありません。**
 *
 * WebSocket が開いたままなので **Node のイベントループが終わらず、プロセスが残ります**。
 * 🚨 **仕事そのものは終わっていて、出力も書かれています。**
 * ```
 * 【測った】closeTab / process.exit を書かないスクリプト
 *   直接ファイルへ出す … **1 行**（＝ 測定は完了している）
 *   🚨 `| tail -3` を挟む … **0 行**（**tail は stdin が閉じるまで 1 行も出せない**）
 * ```
 * ＝ 🚨 **「終わらないスクリプト」＋「後段の tail」で、成功した測定が全損に見えます。**
 * 私はこれを 2 分の timeout として 2 回受け取り、**「CDP が落ちている」と誤診しました**
 * （実際は :9333 は生きていて、`open()` は **68ms**、`goto()` は **750〜855ms** でした）。
 *
 * → **測定が終わらないと思ったら、まず `| tail` を外してファイルへ出す。**
 *   `> out.txt` にして中身を見れば、**測れているのか、本当に止まっているのか**が分かれます。
 * → 書く側は `try { … } finally { await page.closeTab(); }` ＋ 末尾 `process.exit(0)`。
 *
 * ## 🚨 実際に踏んだ落とし穴（3つとも「測れているつもり」で終わる形）
 *
 * 1. **ロケールを固定しないと英語の画面を測る。**
 *    headless Chrome の `Accept-Language` は既定で `en` なので、`i18n/server.ts` の
 *    解決順（Cookie → Accept-Language → …）で英語になる。実測で「設定」ではなく "Settings" が
 *    返り、**堀池さんが見ている画面とは別のものを測っていた**。
 *    → 文言・見た目を測る前に必ず `setCookie("ohmycms_locale", "ja", origin)`。
 *    🚨 `document.cookie` で入れないこと。タブがまだ `about:blank` だと
 *    `SecurityError: Access is denied for this document` で落ちる（共有の :3102 が
 *    重いときに必ず起きる）。**CDP の `Network.setCookie` なら遷移前でも入る。**
 *
 * 2. **`closeTab()` は検証スクリプトの最後で毎回呼ぶ（2026-08-15 以前は逆の注意書きだった）。**
 *    以前はここに「`closeTab()` は呼ばない。最後のタブを閉じるとブラウザごと終わる」と
 *    書いていたが、実際の検証スクリプト群（例: `probe-nav.mjs`）はとっくに
 *    `closeTab()` を呼んでから `process.exit(0)` する形が定着していた。**Chrome を複数ペインで
 *    共有し、常に他のタブが開いている実運用では、1個閉じてもブラウザは終了しない。**
 *    それでも「本当に最後の1枚だった」場合にブラウザごと終了するリスク自体はゼロではないので、
 *    それが心配なら閉じずに `process.exit(0)` だけでもよい——**落とし穴6の後始末が両方の書き方を
 *    カバーする**（`closeTab()` を呼んでいれば冪等にスキップ、呼んでいなければ `process.exit()`
 *    の差し替えが代わりに閉じる）。
 *    🚨 逆に `process.exit()` を書き忘れると、WebSocket が開いたままで
 *    **node が終了しない**（ハングに見える）。
 *
 * 3. **固定の待ち時間にしない。**
 *    :3102 は全ペインで共有していて、他の作業で簡単に遅くなる。`setTimeout` で決め打ちすると
 *    読み込み前に評価して「要素が無い」＝**壊れていないのに赤**になる。
 *    → `goto()` は `Page.loadEventFired` を待つ（上限つき）。
 *
 * 4. 🚨 **`elementFromPoint` は「前後」ではなく「触れるか」を測っている。**
 *    この API は **`pointer-events: none` の要素を飛ばす**ので、
 *    **「後ろにある」と「前にあるが触れない」が同じ結果になる。**
 *    実例（2026-08-15・shell と toast が別々に踏んだ）: Radix の Dialog は開くと
 *    `document.body` に `style="pointer-events: none"` を付ける。配下のトーストは
 *    それを継承するので、`z-index` が上でも `elementFromPoint` はモーダル側を返す。
 *    **「トーストがモーダルの後ろに出ている」と誤報しかけた。**
 *
 *    → **描画順を知りたいなら、当たり判定を一時的に戻して測り直す**:
 *    ```js
 *    const before = slotOf(document.elementFromPoint(x, y));   // そのまま
 *    viewport.style.pointerEvents = "auto";
 *    const after  = slotOf(document.elementFromPoint(x, y));   // 当たり判定を戻す
 *    viewport.style.pointerEvents = "";
 *    // before ≠ after なら、前後の問題ではなく**触れないという問題**
 *    ```
 *    🚨 そして **`pointer-events` と `aria-hidden` は別々に見る**。触れるようにしても
 *    `aria-hidden="true"` が祖先に残っていれば、**読み上げには存在しない**ままになる
 *    （通知としては届いていない）。**「見える」「押せる」「読み上げられる」は3つ別の質問。**
 *
 * ## 🚨 測るときの心得（`~/.claude/rules/count-before-you-report.md`）
 * - **要素を名指しするときは `data-slot` で。** `aria-expanded` のような属性は複数の部品が
 *   持つ。実際に info ボタンを押したつもりで**パンくずのドロップダウンを押していて**、
 *   「パネルが開かない」と誤診しかけた。
 * - **文言の数で数えない。** 辞書は `I18nProvider` に丸ごと渡されるので、
 *   **描画されていない文言も HTML に必ず 1 回は出る**。行き先を数えるなら `href` を数える。
 * - **対照を必ず並べる。** 「0 件」は単独では「異常が無い」と「見ていない」を区別できない。
 *   必ず 1 になるもの／必ず 0 になるものを一緒に出す。
 *
 * 5. 🚨 **「サーバが落ちている」と「要素が無い」は、同じ「0 件」の顔で出る。**
 *    2026-08-15 実測: この駆動器には `status`/`responseCode`/`Network.responseReceived` を
 *    拾う仕組みが**0 件**だった。`eval()` で要素を数えて 0 が返ったとき、それが
 *    「本当に無い」のか「500/接続不可でページ自体が描画されていない」のかを**区別できなかった**。
 *    → `Page.navigate` の主ドキュメントの HTTP ステータスを `goto()` 実行後に
 *    `page.lastStatus`（`page.status()` でも取れる）に入れるようにした。
 *    `goto()` 自体の戻り値・呼び出し方は変えていない（**既存コード 0 件がこの戻り値を
 *    使っていることを grep で確認済み**。変えても壊れないが、念のため互換を保った）。
 *    - 200/404 のような **HTTP レスポンスが来た**場合は数値。
 *    - **接続不可**（`net::ERR_CONNECTION_REFUSED` 等、TCP接続自体に失敗）の場合は
 *      `"ERR:net::ERR_CONNECTION_REFUSED"` のような**文字列**（`ERR:` 接頭辞）。
 *      数値と文字列で型が違うので `typeof === "number"` で機械判定もできる。
 *    - 🚨 **`where()` は async。いまは `await` を忘れると例外で落ちる**（下記）。
 *      足した直後は `[object Promise]` が**静かに出るだけ**だった。実測で踏んだ（2026-08-15）。
 *      ここは**測定の1行目**なので、忘れると
 *      「いまどこに居るか」が毎回 `[object Promise]` になり、**何も分からないまま
 *      後続の 0 件を読むことになる**。司令塔指摘（2026-08-15）「`await` 忘れを形で塞げないか」
 *      を受け、**今は `await` せずに文字列化しようとすると例外で落ちる**ようにしてある
 *      （`where()` が返す Promise の `Symbol.toPrimitive` / `toString` だけを、そのインスタンス
 *      限定で throw に差し替えている。`await` / `.then()` は Promise の内部スロットで動くので
 *      影響を受けない）。`status()` は同期なので、`await` を疑うときは `page.status()` と
 *      並べて出すと切り分けやすい。
 *      （**同期関数にはしていない**。`lang` は毎回 `document.documentElement.lang` を
 *      評価して取っている＝live な値。`goto()` の時点で固定すると、クライアント側で
 *      言語が切り替わる画面（Cookie 変更やルーティングでの再描画）を測るときに
 *      古い値のまま嘘をつく。だから同期化はせず、Promise の**中身**でなく
 *      **await せず文字列化しようとする経路**だけを塞いだ）
 *    - 使い方: 測定スクリプトの**1行目**で `console.log(await page.where())` を呼ぶ。
 *      `url=... lang=ja status=200` のように、URL・言語・直前の HTTP コードを1文字列で出す。
 *      500 や接続不可なら `status` が非200/非404の値で分かるので、後続の「要素が0件」を
 *      「壊れているから0」と「本当に無いから0」に区別できる。
 *
 * 6. 🚨 **スクリプトが途中で落ちる／殺されると、タブが Chrome に残り続ける（2026-08-15 実測）。**
 *    朝は75タブでChromeが固まり CDP に繋がらなくなった。**1回のプローブが1個ずつ漏らす**ため、
 *    溜まると **この駆動器を使う全ペインのブラウザ測定が同時に止まる**（対照: `/json/version` は
 *    200 のまま＝Chrome自体は生きているのにCDPで新規タブが作れなくなる、という壊れ方をする）。
 *
 *    対処前の実測（この修正の直前・同一Chromeインスタンス）:
 *    ```
 *    例外で落ちる    (closeTab() に到達しない) : タブ 40 → 41 (+1 漏れ)
 *    SIGTERM で殺す  (無限に待つスクリプトをkill) : タブ 41 → 42 (+1 漏れ)
 *    ```
 *    → **`open()` した Session をプロセス単位のレジストリで追跡**し、次のいずれでプロセスが
 *    終わるときも、**まだ閉じていない自分のタブだけ**を `/json/close/<targetId>` で閉じてから
 *    実際に終了する: `SIGTERM` / `SIGINT` / `uncaughtException` / `unhandledRejection` /
 *    そして **`process.exit()` そのもの**（`closeTab()` を呼ばずに `process.exit(0)` で終わる
 *    既存の書き方も塞ぐため。`process.exit` を「後始末してから元の exit を呼ぶ」ものに
 *    差し替えている。**同期関数にはできない**——CDPの `fetch` は非同期な往復が要るため、
 *    元の `process.exit` を `Promise` の解決後に呼ぶ形にした。呼び出し側から見た挙動は
 *    「`process.exit(0)` を書いた行より後には進まない」ので変わらない）。
 *
 *    **二重に閉じない**: `Session` に `closed` フラグを持たせ、`closeTab()` を明示的に
 *    呼んだあと（＝もう閉じている）に上記のハンドラが発火しても、フラグを見て素通りする。
 *    `closeTab()` 自体も冪等にした（2回呼んでもエラーにならない）。
 *
 *    **なぜ他のタブを閉じない**か: レジストリに積むのは `open()` が**そのプロセス内で**返した
 *    `Session` インスタンスだけで、`targetId` はそのタブ固有の識別子。他ペイン・他プロセスが
 *    開いたタブの `targetId` はこのレジストリに一切現れないので、閉じる対象になり得ない
 *    （Chrome は複数プロセスから同じ `:9333` に相乗りする共有物であることの裏返し）。
 *
 *    対処後の実測（受入基準・全て「タブ数が増えない」を確認）は `docs/` ではなくこの作業の
 *    報告に実測値として残してある（このファイル自体には最新の数値を書き続けない——実行の
 *    たびに変わるため。**再現したいときは上の「対処前の実測」と同じ形で自分の手元で測り直す**）。
 *
 * 7. 🚨 **可視判定はクラス名でなく算出値（`getBoundingClientRect` / `getComputedStyle`）で行う。**
 *    2026-08-15 時点、この駆動器を使う複数のペインが**それぞれ自分で**可視判定を書こうとしていた。
 *    実測: `visible|sr-only|clip|aria-hidden` を含む行はこのファイルに 2 行あったが、
 *    どちらも既存コメントの文章（この落とし穴の解説そのもの）で、**判定の実装は 0 件**だった。
 *    各自が毎回書くと条件が必ず割れる／漏れるので、`page.visibleTexts(selector)` として
 *    ここに集約した。
 *
 *    - **なぜクラス名（`sr-only` 等）で判定しないか**: クラス名は CSS の実装詳細であって
 *      契約ではない。Tailwind のバージョンが変わる・別ユーティリティ名に置き換わる・
 *      自前のクラスで同じ効果を作る、のどれでも文字列一致の判定は壊れる。ブラウザが最終的に
 *      「見えない」と判断する材料は算出された box とスタイルだけなので、そこを直接見る。
 *    - **なぜ `width > 0 && height > 0` では足りないか**: スクリーンリーダー専用に見せる
 *      定番実装（Tailwind の `sr-only` 等）は
 *      `width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0)` のように
 *      **幅・高さをゼロにせず 1px だけ残す**（`width:0` にすると読み上げごとスキップされる
 *      支援技術があるため、意図的に 1px を残している）。`> 0` の判定だとこの 1×1px 要素を
 *      「見える」と誤判定する。**`<= 1px` で見る必要がある。**
 *    - **なぜ「外した件数」を返すか**: 可視文字だけを返して黙って間引くと、
 *      「そもそも対象が無かった（0件）」と「見た上で除外条件に当たって外した（0件）」が
 *      同じ `[]` の顔になる（`~/.claude/rules/count-before-you-report.md` の
 *      「0件は単独では情報を持たない」と同じ話）。呼び出し側が
 *      `外した.小さい / clip / ariaHidden / 非表示` の内訳を見れば、
 *      「本当に対象が無かった」のか「除外条件で落ちた」のかを区別できる。
 *
 * 8. 🚨 **`setDeviceMetricsOverride({ mobile: true })` だけでは「幅だけ変えた PC」にしかならない。**
 *    2026-08-15 実測（この駆動器で）: 幅を 390 にしても `matchMedia("(hover: hover)").matches`
 *    は **true のまま**、`pointer:coarse` は **false のまま**、`navigator.maxTouchPoints` は
 *    **0 のまま**だった。`mobile: true` が変えるのは `window.innerWidth` や
 *    `device-width` 系のメディアクエリだけで、**入力方式（hover・pointer・タッチ）は別の
 *    override**（`Emulation.setEmulatedMedia` / `Emulation.setTouchEmulationEnabled`）が要る。
 *    Tailwind の `hover:` ユーティリティは `@media (hover: hover)` に包まれるので、
 *    この2つを足さないまま「SP で測った」と言っても、**本物の SP では効かない hover 挙動が
 *    測定では効いたまま**になり、測定そのものが嘘になる。
 *
 *    **なぜ PC に戻すときに明示的に外す必要があるか**: 同じスクリプトの中で SP → PC と
 *    切り替えて対照を取る形が実在する。`Emulation.setEmulatedMedia` /
 *    `Emulation.setTouchEmulationEnabled` は**タブ単位で状態を保持する override**なので、
 *    SP 用に付けた `hover:none` / タッチ有効化を PC 側で呼び直さずに放置すると、
 *    「幅だけ 1280 に戻したのに hover:none のまま」という**残骸**が残る。
 *    実測（`features: []` を渡す）で override 自体が完全に解除され、`hover:hover=true` /
 *    `pointer:fine=true` / `maxTouchPoints=0`（素の headless Chrome の既定）に戻ることを
 *    確認済み（sp → pc → sp と往復させても値が一致することも確認済み）。
 *
 * 12. 🚨 **「計器が壊れている」と読む前に、同じ計器の別の値を見る。**
 *    2026-08-16、`getBoundingClientRect().width` が **0** を返したのを見て、
 *    **「この計器は幅について何も言っていない」と報告した**。🚨 **誤りだった。本当に 0px だった。**
 *
 *    見落としたもの: **同じ呼び出しで、親の箱は 384px を返していた**。
 *    ＝ **計器は幅を測れている**。**なら、その 0 は本物**。
 *
 *    真因（Tailwind v4）: `.scale-x-0` は **`scale` プロパティ**を書き、
 *    `@keyframes` は **`transform: scaleX()`** を書いていた。**別のプロパティなので掛け算になる**——
 *    `scale(0) × transform(0.594) = 0`。
 *    **animation は走り、色も付き、それでも面は 1px も出ない。**
 *    （同じ形が 3 回出ている: `translate` / `hover:` の `@media` / `scale-x-*`。
 *      **v4 は transform を translate / scale / rotate の 3 つに割った**）
 *
 *    → **0 を見たら「異常が無い 0 / 見ていない 0 / 落ちた 0」の**どれかを対照で決める**。
 *      **同じ計器が別の対象で 1 以上を返しているなら、「見ていない 0」ではない。**
 *    🚨 **「測れませんでした」と書くのは、対照を取ってからにする。**
 *      正しい観測を「計器の故障」として捨てるのが、いちばん惜しい取りこぼしになる。
 *
 * 11. 🚨 **`:active` だけを強制して測らない**（2026-08-16・別のペインが発見）。
 *    **PC で押すとき、指は必ず先に hover を当てている。** `:active` 単独を強制すると
 *    **hover が外れて素の色に戻る**ので、実際には起こらない組み合わせを測ることになる。
 *    その測り方だと結論が**逆に出る**（`active:` を足した形のほうが「差が無い」と出て、
 *    足していない形が「差が在る」と出る）。→ 押下は **`["hover","active"]` を同時に**。
 *    `pseudoStyle()` はこの形で測り、`通常 → 触れ` が変わることを**計器が生きている対照**として返す。
 *
 *    🚨 実測でこうなる（2026-08-16・`/login` の主ボタン）:
 *      通常 `23,23,23,255` → 触れ `22,22,22,204` → 押下 **触れと同じ**
 *      ＝ **PC では押しても色が変わらない**（手応えは色ではなく `Button` の 1px の沈み込み）。
 *      **タッチ端末には hover が無い**ので、そちらは別に測ること。
 *
 * 9. 🚨 **算出スタイルを「文字列で比べて」変化を判定しない。表記が違うだけで同じ色がある。**
 *    2026-08-15 実測（schema・w4A:p27 が自分の測定で踏んだ）。`:active` が効いているかを
 *    `CSS.forcePseudoState` で調べ、`通常 !== 押下` で判定したところ **✅ が出たが嘘だった**:
 *
 *      通常 = `rgba(0, 0, 0, 0)`   押下 = `oklab(0 0 0 / 0)`   ← **どちらも透明。同じ色。**
 *
 *    Chrome は同じ色を文脈によって `rgba()` / `lab()` / `oklab()` と**別の記法**で返す。
 *    文字列比較は「変わっていないのに変わった」と言う。**必ず数値へ正規化してから比べる**:
 *
 *      const c = document.createElement("canvas"); c.width = c.height = 1;
 *      const x = c.getContext("2d"); x.clearRect(0,0,1,1);
 *      x.fillStyle = <算出値>; x.fillRect(0,0,1,1);
 *      [...x.getImageData(0,0,1,1).data].join(",")   // → "115,115,115,255"
 *
 *    **もう一つ同時に踏んだ**: 対象に `transition-*` が付いていると、pseudo を強制した
 *    **直後**に読んだ値は**遷移の途中**（始点に近い値）になる。**遷移が終わるまで待ってから読む。**
 *    この2つを直したら、同じ要素が `115,115,115,255 → 10,10,10,255` と**正しく変化して見えた**。
 *
 * 10. 🚨 **「要素が無い」と「効いていない」を同じ結果にしない。**
 *    同じ測定で、直した対象が**ダイアログの中にしか存在しない**要素だった。閉じたまま測ると
 *    `querySelector` が null を返し、**「変わらなかった」と読みかけた**（実際は開けば ✅ だった）。
 *    → 要素が取れなかったときは**変化なしと書かず、「この測定は何も言っていません」と出す**。
 *    このファイルの `visibleTexts` が「外した件数」を返すのと同じ理由（落とし穴7）。
 */

const PORT = 9333;
const BASE = `http://127.0.0.1:${PORT}`;

// 落とし穴6: このプロセスが `open()` したタブのレジストリ。プロセス終了時の後始末は
// ここに載っている（＝このプロセスが開いた）タブだけを対象にする。
const openSessions = new Set();

/** 直接 `/json/close/<id>` を叩く（`closeTab()` と後始末ハンドラの共通処理）。 */
async function closeTarget(targetId) {
  await fetch(`${BASE}/json/close/${targetId}`).catch(() => {});
}

// 落とし穴6: まだ閉じていない自分のタブを全部閉じる。何度呼んでも安全
// （進行中の Promise を使い回すので、SIGTERM ハンドラと process.exit 差し替えが
// ほぼ同時に発火しても二重に fetch しない）。
let cleanupInFlight = null;
function cleanupOwnTabs() {
  if (!cleanupInFlight) {
    cleanupInFlight = (async () => {
      const targets = [...openSessions];
      for (const session of targets) {
        if (session.closed) continue; // closeTab() 済み・二重に閉じない
        session.closed = true;
        openSessions.delete(session);
        await closeTarget(session.targetId);
      }
    })();
  }
  return cleanupInFlight;
}

// 落とし穴6: プロセス終了経路をまとめて塞ぐ。`open()` が最初に呼ばれたときに一度だけ登録する
// （複数回 `open()` してもハンドラが重複登録されないように、モジュール単位のフラグで守る）。
let processCleanupRegistered = false;
function ensureProcessCleanupRegistered() {
  if (processCleanupRegistered) return;
  processCleanupRegistered = true;

  // `process.exit()` そのものを「後始末してから元の exit を呼ぶ」ものに差し替える。
  // closeTab() を呼ばずに process.exit(0) だけで終わる既存の書き方もこれで塞がる。
  // 同期関数のままにはできない（CDP の fetch が非同期な往復を要るため）。呼び出し側から見た
  // 挙動は変わらない: process.exit(0) を書いた行より後には進まない。
  const originalExit = process.exit.bind(process);
  process.exit = (code) => {
    cleanupOwnTabs().finally(() => originalExit(code));
  };

  // SIGTERM/SIGINT: 後始末してから、ハンドラを外して自分自身に同じシグナルを再送する
  // （こうすると Node の既定の終了コード・終了経路をそのまま再現できる。exit code を
  // 129/130/143 のように決め打ちで作らない）。
  const onSigterm = () => {
    cleanupOwnTabs().finally(() => {
      process.removeListener("SIGTERM", onSigterm);
      process.kill(process.pid, "SIGTERM");
    });
  };
  const onSigint = () => {
    cleanupOwnTabs().finally(() => {
      process.removeListener("SIGINT", onSigint);
      process.kill(process.pid, "SIGINT");
    });
  };
  process.on("SIGTERM", onSigterm);
  process.on("SIGINT", onSigint);

  // 未捕捉の例外・rejection: 後始末してから、Node の既定挙動どおりスタックを出して exit(1)。
  process.on("uncaughtException", (err) => {
    cleanupOwnTabs().finally(() => {
      console.error(err);
      originalExit(1);
    });
  });
  process.on("unhandledRejection", (reason) => {
    cleanupOwnTabs().finally(() => {
      console.error("Unhandled rejection:", reason);
      originalExit(1);
    });
  });
}

/**
 * `await` せずに文字列化しようとしたら throw する Promise に変える（落とし穴5・`await` 忘れ対策）。
 *
 * テンプレートリテラル（`` `${p}` ``）・`String(p)`・`p + ""` は、いずれも ToPrimitive
 * （hint "string" または既定）を経由し、**まず `Symbol.toPrimitive` を探す**。それが無いときだけ
 * `toString` → `valueOf` の順に落ちる。ここでは両方を、渡された Promise **インスタンスだけ**に
 * `Object.defineProperty` で差し替える（`Promise.prototype` は一切触らない。他の Promise・
 * 他の `await` 済みの値には影響しない）。
 *
 * `await p` / `p.then(...)` は文字列化を経由しない（エンジンが内部の [[PromiseState]] を直接見る）
 * ので、この差し替えの影響を受けずに今までどおり動く。
 */
function guardAsyncStringCoercion(promise, callLabel) {
  const throwNotAwaited = () => {
    throw new Error(`${callLabel} は async です。await ${callLabel} と書いてください。`);
  };
  Object.defineProperty(promise, Symbol.toPrimitive, {
    value: throwNotAwaited,
    configurable: true,
  });
  Object.defineProperty(promise, "toString", {
    value: throwNotAwaited,
    configurable: true,
  });
  return promise;
}

class Session {
  constructor(ws, targetId) {
    this.ws = ws;
    this.targetId = targetId;
    this.id = 0;
    this.pending = new Map();
    // 落とし穴5: 主ドキュメントの HTTP ステータス。goto() が毎回更新する。
    // 未実行時は null（「まだ measure していない」を「200 だった」と混同しないため）。
    this.lastStatus = null;
    this.lastUrl = null;
    // open() の Page.getFrameTree で埋める。トップフレームの識別に使う
    // （Network.responseReceived が iframe/XHR の応答まで拾わないための絞り込み）。
    this.frameId = null;
    // 落とし穴6: closeTab() 済み（または後始末ハンドラが既に閉じた）かどうか。
    // 二重に /json/close を叩かないためのフラグ。
    this.closed = false;
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      const resolve = this.pending.get(msg.id);
      if (resolve) {
        this.pending.delete(msg.id);
        resolve(msg);
      }
    });
  }

  /**
   * 🚨 **CDP がエラーを返したら投げる**（2026-08-15 に足した）。
   *
   * それまでは `msg.error` を**一切見ずに resolve** していた。
   * ＝ `setViewport` / `setEmulatedMedia` / `setTouchEmulationEnabled` / `setCookie` /
   * `Page.navigate` は、**失敗しても成功と同じ顔**で返っていた（`eval()` だけが `res.error` を見ていた）。
   *
   * 実際に起きた形:
   *   `setTouchEmulationEnabled({ enabled: false, maxTouchPoints: 0 })`
   *   → `-32602 Touch points must be between 1 and 16` で**拒否される**
   *   → **触る端末の設定が解除されないまま**、幅だけ PC に戻る
   *   → `matchMedia('(hover: hover)')` が **false のまま**なのに、
   *     測っている人は「幅 1280 だから PC で測れている」と読む。**見た目の数字では気づけない。**
   *
   * 🚨 **失敗を成功と同じ顔で通す計器は、何も測っていないのと同じ**（今日の規律）。
   *
   * 入れる前に実測: 普通の流れ（setCookie ×2 → setViewport ×2 → goto ×2 → eval → where）で
   * 送る CDP は **16 回・error は 0 件**（🟢 対照: わざと壊した 1 回は検出できた）。
   * ＝ **既存の使い方は 1 件も落ちない。**
   */
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, (msg) => {
        if (msg?.error) {
          // 🚨 params も出す。「どの呼び方が拒否されたか」が無いと、直せない
          //    （`{enabled:false}` と `{enabled:false, maxTouchPoints:0}` は見た目がほぼ同じ）。
          reject(new Error(
            `CDP が拒否しました: ${method} → ${msg.error.code} ${msg.error.message}`
            + ` / 送った引数: ${JSON.stringify(params)}`,
          ));
          return;
        }
        resolve(msg);
      });
    });
  }

  /**
   * 読み込みを待ってから返る（落とし穴3）。
   * 🚨 落とし穴5: 主ドキュメントの HTTP ステータスを `this.lastStatus` へ入れる
   * （`goto()` 自体の戻り値・呼び出し方は互換のため変えていない。ファイル冒頭の解説を参照）。
   * 数値なら実際に HTTP レスポンスが来たとき、`"ERR:..."` 文字列なら
   * 接続不可（TCP接続自体に失敗）や原因不明のタイムアウトのとき。
   */
  async goto(url, settleMs = 700, timeoutMs = 20000) {
    this.lastUrl = url;
    this.lastStatus = null;
    const loaded = new Promise((resolve) => {
      const onMessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.method === "Network.responseReceived") {
          // 主フレームの「文書」レスポンスだけ拾う（XHR/フォント等の type は無視）。
          // リダイレクトで複数回来ることがあるが、最後に来たものが最終ステータスになる。
          const p = msg.params;
          if (p.type === "Document" && p.frameId === this.frameId) {
            this.lastStatus = p.response.status;
          }
        } else if (msg.method === "Network.loadingFailed") {
          // 接続不可（DNS失敗・ERR_CONNECTION_REFUSED 等）は HTTP レスポンスが来ないので
          // ここでしか検知できない。「要素が無い」と区別するため文字列で明示する。
          const p = msg.params;
          if (p.type === "Document" && p.frameId === this.frameId) {
            this.lastStatus = `ERR:${p.errorText}`;
          }
        } else if (msg.method === "Page.loadEventFired") {
          this.ws.removeEventListener("message", onMessage);
          resolve(true);
        }
      };
      this.ws.addEventListener("message", onMessage);
      setTimeout(() => {
        this.ws.removeEventListener("message", onMessage);
        resolve(false);
      }, timeoutMs);
    });
    const navResult = await this.send("Page.navigate", { url });
    // URL自体が不正等、ナビゲーション開始前に同期的に失敗した場合はここで判明する。
    if (navResult?.result?.errorText && this.lastStatus === null) {
      this.lastStatus = `ERR:${navResult.result.errorText}`;
    }
    await loaded;
    if (this.lastStatus === null) {
      // Network.responseReceived も loadingFailed も来ないまま loadEventFired/timeout に
      // 達した場合。通常は起きないはずだが、null のまま返すと「未計測」と区別が付かないため
      // 明示的な値にしておく。
      this.lastStatus = "ERR:unknown_no_response";
    }
    // 水和（React が動き出す）ぶんだけ待つ
    await new Promise((r) => setTimeout(r, settleMs));
  }

  /** `goto()` の戻り値を変えずに直前の HTTP ステータスを取り出す（落とし穴5）。 */
  status() {
    return this.lastStatus;
  }

  /**
   * 🚨 落とし穴5: 「いまの URL / lang / 直前の HTTP コード」を1文字列で返す。
   * 測定スクリプトの**1行目**でこれを出すと、「サーバが落ちている」と「要素が無い」を
   * 見分けられる（前者は status が非200/404、あるいは "ERR:..." になる）。
   *
   * 🚨 **`await` 忘れは形で塞んである。** `where()` 自体は今までどおり Promise を返す
   * （同期化はしていない — 理由はファイル冒頭の落とし穴5を参照）。ただしその Promise を
   * `await` せずに文字列化しようとする（`` `${page.where()}` `` 等）と例外で落ちる。
   * `await page.where()` / `page.where().then(...)` は普通に動く。
   */
  where() {
    return guardAsyncStringCoercion(this.#whereImpl(), "page.where()");
  }

  async #whereImpl() {
    let url = this.lastUrl ?? "?";
    let lang = "?";
    try {
      url = await this.eval(`location.href`);
    } catch {
      // 接続不可のページでは評価自体が失敗しうる。goto() に渡した URL にフォールバック。
    }
    try {
      lang = await this.eval(`document.documentElement.lang || "?"`);
    } catch {
      // 同上。lang は "?" のまま返す。
    }
    return `url=${url} lang=${lang} status=${this.lastStatus ?? "?"}`;
  }

  /** Cookie は `document.cookie` でなくここから入れる（落とし穴1）。 */
  async setCookie(name, value, url) {
    await this.send("Network.setCookie", { name, value, url, path: "/" });
  }

  /**
   * 画面幅を変える。SP は 390x844 / PC は 1280x900 で測っている。
   *
   * 🚨 **幅を SP にしただけでは「触る端末」になりません**（落とし穴8・2026-08-15 実測・この driver で）。
   *    `setDeviceMetricsOverride({ mobile: true })` だけで幅 390 にすると:
   *      hover:hover = **true** / pointer:coarse = **false** / maxTouchPoints = **0**
   *    ＝ **PC を細くしただけ**。Tailwind の `hover:` は `@media (hover: hover)` に包まれるので、
   *      **本物の SP では効かない装飾が、測定では効いたまま**になります。
   *    「SP で測った」と書いた測定が、hover やタッチの挙動を含むなら**測れていません**。
   * 🚨 **幅・入力・書体は別々に設定するもの**（司令塔 2026-08-15）。
   *    → 幅に加えて `Emulation.setEmulatedMedia` で `hover` / `any-hover` / `pointer` /
   *    `any-pointer` の media features を、`Emulation.setTouchEmulationEnabled` でタッチ点を
   *    上書きする（`any-hover`/`any-pointer` は「タッチ機器に外付けマウスが繋がっている」ような
   *    CSS 判定にも使われるため、`hover`/`pointer` だけでなく必ず4つとも渡す）。
   * 🚨 **`mobile === false` のときは、前回 sp で付けた override を必ず外す**。
   *    `Emulation.setEmulatedMedia({ features: [] })` は「空配列を追加する」のではなく
   *    **override そのものを解除する**動作であることを実測済み（`features:[...]` → `features:[]`
   *    → 素の headless Chrome の既定値（hover:hover=true / pointer:fine=true /
   *    maxTouchPoints=0）に戻る。sp → pc → sp と往復させても同じ値に戻ることも確認済み）。
   *    `setTouchEmulationEnabled({ enabled: false })` も同様に、有効化していた分を明示的に外す。
   *    同じスクリプトの中で SP → PC と切り替えて測る形が実在するため、外し忘れると
   *    **PC 側の測定が SP の残骸を引きずって嘘になる**。
   */
  async setViewport(width, height, mobile = false) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: mobile ? 2 : 1,
      mobile,
    });
    if (mobile) {
      await this.send("Emulation.setEmulatedMedia", {
        features: [
          { name: "hover", value: "none" },
          { name: "any-hover", value: "none" },
          { name: "pointer", value: "coarse" },
          { name: "any-pointer", value: "coarse" },
        ],
      });
      await this.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    } else {
      // features: [] で override を完全に解除する（「hover:hover を明示指定」ではなく
      // 「override を外して素の既定に戻す」形。実測でどちらでも同じ値になることは確認済みだが、
      // 「外す」という意図をコードでも表すため features:[] を使う）。
      await this.send("Emulation.setEmulatedMedia", { features: [] });
      await this.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    }
  }

  /**
   * 端末を切り替えて、**いま何になっているかを返す**。
   *
   * 🚨 **`setViewport` との違いは「返す」ことだけ**（設定そのものは `setViewport` がやる）。
   *    `where()` と同じ思想で、**測定の1行目に出せる形**にしてある。
   *
   * ```js
   * console.log(await page.asDevice("sp"));
   * // → sp 幅390 hover:none pointer:coarse touch:5
   * console.log(await page.where());
   * ```
   *
   * 🚨 **なぜ「返す」ことに価値があるか。**
   * 2026-08-15、幅だけ 390 にして「SP で測った」と報告した測定が複数あり、
   * **`(hover: hover)` は true のまま**だった（＝ PC を細くしただけ）。
   * **設定したこと**と**そうなっていること**は別なので、**読んだ値を報告に出す**。
   * 司令塔の洗い直しの条件も「`matchMedia` を読んだ記録が無ければやり直し」になっている。
   *
   * 🚨 **pc は「外れていること」が対照**。`hover:hover=true` / `touch:0` が出ていれば、
   *    SP の残骸を引きずっていないと言える（sp → pc → sp の往復で一致することも確認済み）。
   *
   * ⚠️ **ここで見ているのは `matchMedia` と `navigator.maxTouchPoints` だけ**。
   *    書体・実機のタップの手応え・`pointer-events` の重なりは**見ていない**。
   */
  async asDevice(kind) {
    if (kind !== "sp" && kind !== "pc") {
      throw new Error(`asDevice: "sp" か "pc" を渡してください（受け取った値: ${JSON.stringify(kind)}）`);
    }
    const mobile = kind === "sp";
    await this.setViewport(mobile ? 390 : 1280, mobile ? 844 : 800, mobile);

    // 🚨 設定した値ではなく、**ページが実際にそう見えているか**を読む。
    const state = await this.eval(`(() => ({
      width: innerWidth,
      hover: matchMedia("(hover: hover)").matches ? "hover" : (matchMedia("(hover: none)").matches ? "none" : "?"),
      pointer: matchMedia("(pointer: fine)").matches ? "fine" : (matchMedia("(pointer: coarse)").matches ? "coarse" : "?"),
      touch: navigator.maxTouchPoints,
    }))()`);

    // 🚨 「切り替えたつもり」で終わらせない。**そうなっていない**なら、その場で止める。
    //    （沈黙する失敗を作らない。ここを通った測定は、端末が合っていると言える）
    const want = mobile
      ? { hover: "none", pointer: "coarse" }
      : { hover: "hover", pointer: "fine" };
    if (state.hover !== want.hover || state.pointer !== want.pointer) {
      throw new Error(
        `asDevice("${kind}") を呼びましたが、ページは ${JSON.stringify(state)} のままです。` +
          `**切り替わっていません**（期待: hover=${want.hover} / pointer=${want.pointer}）。` +
          "この状態の測定は、端末の話としては使えません。",
      );
    }

    // 🚨 幅も見る。**hover / pointer が合っていても、レイアウトは PC のことがある。**
    //    `<meta name="viewport">` を持たないページは、モバイル指定でも
    //    **レイアウト用の幅が 980px になる**（ブラウザの既定）。
    //    実測（2026-08-16・同じページを meta 有無だけ変えて比較）:
    //      🟢 meta 有り → sp 幅390  matchMedia("(min-width: 768px)") = **false**
    //      🔴 meta 無し → sp 幅980  matchMedia("(min-width: 768px)") = **true**
    //    ＝ 🚨 **hover:none / pointer:coarse なのに、Tailwind の `md:` が効く**。
    //       **実機には存在しない状態**なので、ここで測ったものは SP の話になりません。
    //    hover の穴（幅だけ 390 にして「SP で測った」）と同じ形が、幅の側にも在りました。
    //    🟢 このリポジトリの画面は Next.js が meta を出すので影響しません
    //       （実測: /login の HTML に `<meta name="viewport" …>` 1 件）。
    //       落ちるのは、手で書いた検証用ページ・`data:` URL の側です。
    const wantWidth = mobile ? 390 : 1280;
    if (state.width !== wantWidth) {
      throw new Error(
        `asDevice("${kind}") は幅 ${wantWidth} を指定しましたが、ページは幅 ${state.width} です` +
          `（hover / pointer は切り替わっています: ${JSON.stringify(state)}）。` +
          "🚨 **レイアウトだけ別の端末になっています。** " +
          (state.width === 980
            ? "980 は `<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">` が" +
              "無いページの既定値です。検証用のページなら、その meta を足してください。"
            : "ページ側が幅を変えている可能性があります（zoom / initial-scale など）。") +
          " この状態の測定は、端末の話としては使えません。",
      );
    }

    return Object.assign(
      Object.create({
        toString() {
          return `${kind} 幅${state.width} hover:${state.hover} pointer:${state.pointer} touch:${state.touch}`;
        },
      }),
      { kind, ...state },
    );
  }

  /**
   * ページの中で JS を実行して値を受け取る。
   * 🚨 返す値は **JSON にできるものだけ**（DOM 要素をそのまま返さない）。
   *
   * 🚨 これは `Runtime.evaluate`（CDP）であって、アプリの中の `eval()` ではない。
   *    ブラウザ自動化の正規の手段で、claude-in-chrome の `javascript_tool` と同じもの。
   *    渡すのは**開発者が書いた検証用の式だけ**で、利用者の入力は通らない。
   *    🚨 **このファイルは検証専用。アプリのコードから import しないこと**
   *    （`scripts/` 配下にあるのはそのため。バンドルには入らない）。
   */
  async eval(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.error) throw new Error(JSON.stringify(res.error));
    if (res.result.exceptionDetails) {
      throw new Error(res.result.exceptionDetails.exception?.description ?? "評価に失敗");
    }
    return res.result.result.value;
  }

  /**
   * `selector` に一致する要素のうち、落とし穴7の4条件に当たるものを除いた
   * `textContent`（trim 済み）の配列と、除いた件数の内訳を返す。
   *
   * 🚨 判定は算出値（`getBoundingClientRect` / `getComputedStyle`）だけで行い、クラス名は見ない。
   * 除外は次の順で判定し、最初に当たった条件のバケットに数える（4条件のどれにも当たらなければ
   * 残す）:
   *   1. `小さい` … 幅 または 高さ が **1px 以下**（`> 0` ではなく `<= 1px` で判定。落とし穴7）
   *   2. `clip`   … 旧 `clip`（`rect(...)`）が `auto` でない、または `clip-path` が要素自身を
   *                 1px 以下まで削っている（`inset()` は実際に効いている辺の値から可視サイズを
   *                 計算する。`inset()` 以外の非 `none` な `clip-path` 関数は面積を厳密計算
   *                 しないが、明示的に付いている時点で「意図的に隠す」ケースが多いため潰されて
   *                 いるとみなす）
   *   3. `ariaHidden` … 自身または祖先のいずれかが `aria-hidden="true"`
   *   4. `非表示` … `visibility: hidden` または `display: none`
   *
   * 可視文字が 1 件も無くても例外にはしない。`外した` の内訳と `全体`（一致した要素数）を
   * 一緒に返すので、呼び出し側は「対象が無かった」のか「除外に当たって落ちた」のかを区別できる。
   */
  async visibleTexts(selector) {
    const script = `
      (function (sel) {
        function isAriaHidden(el) {
          for (let n = el; n; n = n.parentElement) {
            if (n.getAttribute && n.getAttribute("aria-hidden") === "true") return true;
          }
          return false;
        }
        function isClipped(el, rect) {
          const cs = getComputedStyle(el);
          if (cs.clip && cs.clip !== "auto") return true;
          const cp = cs.clipPath;
          if (!cp || cp === "none") return false;
          const m = cp.match(/^inset\\(([^)]+)\\)$/);
          if (!m) return true; // inset() 以外の非 none な clip-path は潰されているとみなす
          const parts = m[1].trim().split(/\\s+/);
          const toPx = (v, base) => (v.endsWith("%") ? (parseFloat(v) / 100) * base : parseFloat(v));
          let top, right, bottom, left;
          if (parts.length === 1) {
            // inset(X) は四辺とも X（% は要素自身の幅/高さそれぞれを基準にする）
            top = bottom = toPx(parts[0], rect.height);
            right = left = toPx(parts[0], rect.width);
          } else if (parts.length === 2) {
            top = bottom = toPx(parts[0], rect.height);
            right = left = toPx(parts[1], rect.width);
          } else if (parts.length === 3) {
            top = toPx(parts[0], rect.height);
            right = left = toPx(parts[1], rect.width);
            bottom = toPx(parts[2], rect.height);
          } else {
            top = toPx(parts[0], rect.height);
            right = toPx(parts[1], rect.width);
            bottom = toPx(parts[2], rect.height);
            left = toPx(parts[3], rect.width);
          }
          const visW = rect.width - left - right;
          const visH = rect.height - top - bottom;
          return visW <= 1 || visH <= 1;
        }
        const all = Array.from(document.querySelectorAll(sel));
        let counts = { 小さい: 0, clip: 0, ariaHidden: 0, 非表示: 0 };
        const texts = [];
        for (const el of all) {
          const rect = el.getBoundingClientRect();
          if (rect.width <= 1 || rect.height <= 1) {
            counts.小さい++;
            continue;
          }
          if (isClipped(el, rect)) {
            counts.clip++;
            continue;
          }
          if (isAriaHidden(el)) {
            counts.ariaHidden++;
            continue;
          }
          const cs = getComputedStyle(el);
          if (cs.visibility === "hidden" || cs.display === "none") {
            counts.非表示++;
            continue;
          }
          const t = (el.textContent || "").trim();
          if (t) texts.push(t);
        }
        return { texts: texts, 全体: all.length, 外した: counts };
      })(${JSON.stringify(selector)})
    `;
    return await this.eval(script);
  }

  /**
   * 🚨 **`:hover` / `:active` が本当に効いているかを測る**（落とし穴9・10 をここに集約した）。
   *
   * 各自で `CSS.forcePseudoState` を書くと**必ず割れる**（落とし穴7 で `visibleTexts` を
   * 集約したのと同じ理由）。実際 2026-08-15 に、複数のペインが同時に `active:` の有無を
   * 測っていて、**文字列比較で嘘の ✅ を出した例**が出た。
   *
   * 🚨🚨 **落とし穴11: `:active` だけを強制してはいけない**（2026-08-16・saml が発見）。
   * **PC で押すとき、指は必ず先に hover を当てている。** `:active` だけを強制すると
   * **hover が外れて素の色に戻る**ので、実際には起こらない組み合わせを測ることになる。
   * 実際、その測り方だと結論が**逆に出た**:
   *   `active:` を足した形 … hover→active の差 **無し**
   *   足していない形       … hover→active の差 **在り**（＝「直す前のほうが手応えが在る」）
   * → **押下は `["hover", "active"]` を同時にかける。** 素の `:active` は測らない。
   *
   * 返すもの: `{ 見つかった, 通常, 触れ, 押下, 変わった, 触れて変わった }`
   *   - `通常` … 何も強制しない ／ `触れ` … `:hover` のみ ／ `押下` … 🚨 **`:hover` + `:active`**
   *   - `変わった` … 🚨 **`触れ` → `押下` で変わったか**（＝**指が実際に体験する差**）。
   *     `通常` との比較ではない。PC では押す前に必ず hover が当たっているため
   *   - `触れて変わった` … `通常` → `触れ` で変わったか。**🟢 計器が生きている対照**
   *     （これが false なら hover すら効いておらず、`変わった` は信用できない）
   *   - 色は **`"r,g,b,a"` の数値文字列に正規化**して返す（`rgba()` と `oklab()` の表記差で
   *     「変わった」と誤判定しないため。落とし穴9）
   *   - 要素が無いときは `見つかった: false` を返し、**`変わった` を `null` にする**。
   *     🚨 **「要素が無い」を「変化なし」と同じ顔にしない**（落とし穴10）
   *
   * 🚨 **タッチ端末では hover が無い**ので、この関数の `押下` は PC の話。
   *   タッチ側は `asDevice("sp")` などで媒体を切り替えたうえで別に測ること
   *   （`変わった` が false でも、タッチでは効いている場合がある）。
   *
   * @param {string} selector 対象。**最初の1件**だけを見る
   * @param {string} prop `"color"` / `"background-color"` など
   * @param {number} settleMs 遷移が終わるまでの待ち（`transition-*` が付いていると
   *   強制直後は**途中の値**が返る。落とし穴9）
   */
  async pseudoStyle(selector, prop, settleMs = 400) {
    await this.send("DOM.enable");
    await this.send("CSS.enable");
    const doc = await this.send("DOM.getDocument", { depth: -1 });
    const q = await this.send("DOM.querySelector", {
      nodeId: doc.result.root.nodeId,
      selector,
    });
    const nodeId = q.result.nodeId;
    if (!nodeId) {
      // 🚨 ここで 0 や "変化なし" を返さない。**測れていない**ことを呼び出し側へ返す
      return {
        見つかった: false, 通常: null, 触れ: null, 押下: null,
        変わった: null, 触れて変わった: null,
      };
    }
    const 読む = async (pseudos) => {
      await this.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: pseudos });
      await new Promise((r) => setTimeout(r, settleMs));
      const r = await this.send("CSS.getComputedStyleForNode", { nodeId });
      const 生 = r.result.computedStyle.find((x) => x.name === prop)?.value ?? null;
      if (生 === null) return null;
      // ブラウザ自身に換算させる（記法の違いを潰す唯一確実な手）
      return await this.eval(`(() => {
        const c = document.createElement("canvas"); c.width = c.height = 1;
        const x = c.getContext("2d"); x.clearRect(0, 0, 1, 1);
        x.fillStyle = ${JSON.stringify(生)}; x.fillRect(0, 0, 1, 1);
        return [...x.getImageData(0, 0, 1, 1).data].join(",");
      })()`);
    };
    const 通常 = await 読む([]);
    const 触れ = await 読む(["hover"]);
    // 🚨 落とし穴11: 押下は **hover と同時**。`["active"]` 単独では実際に起こらない状態を測る
    const 押下 = await 読む(["hover", "active"]);
    await this.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] });
    return {
      見つかった: true, 通常, 触れ, 押下,
      変わった: 触れ !== 押下,
      触れて変わった: 通常 !== 触れ,
    };
  }

  /**
   * 検証スクリプトの最後で毎回呼ぶ（落とし穴2・6）。**冪等**（2回呼んでもエラーにならない・
   * 2回目以降は何もしない）ので、後始末ハンドラ（落とし穴6）と競合しても二重に
   * `/json/close` を叩かない。
   *
   * 🚨 Chrome を複数ペインで共有している通常運用では、これで他のタブが無くなることはない。
   * ただし「本当に最後の1枚だった」場合はブラウザごと終了しうる（落とし穴2）。
   */
  async closeTab() {
    if (this.closed) return;
    this.closed = true;
    openSessions.delete(this);
    await closeTarget(this.targetId);
  }
}

export async function open() {
  // 落とし穴6: このプロセスで初めて open() されたときに、後始末ハンドラを一度だけ登録する。
  ensureProcessCleanupRegistered();
  const res = await fetch(`${BASE}/json/new?about:blank`, { method: "PUT" });
  const target = await res.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  const session = new Session(ws, target.id);
  // 落とし穴6: プロセスが落ちる／殺されるとき、このタブを後始末の対象にする。
  openSessions.add(session);
  await session.send("Runtime.enable");
  await session.send("Page.enable");
  await session.send("Network.enable");
  // 落とし穴5: goto() が Network.responseReceived を主フレームのものだけに絞るための
  // frameId をここで確定させる（Page.navigate のたびに問い合わせない。取得失敗時は
  // target.id にフォールバックし、常に何かしらの frameId で絞り込めるようにする）。
  const frameTree = await session.send("Page.getFrameTree");
  session.frameId = frameTree?.result?.frameTree?.frame?.id ?? target.id;
  return session;
}
