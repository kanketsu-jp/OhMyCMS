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
 * await page.setCookie("ohmycms_locale", "ja", "http://localhost:3102");
 * await page.goto("http://localhost:3102/admin/collections");
 * console.log(await page.eval(`document.querySelectorAll("header").length`));
 * process.exit(0);
 * ```
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
 * 2. **`page.close()` を呼ぶと headless Chrome ごと終わる。**
 *    最後のタブを閉じるとブラウザが終了し、次のスクリプトが `ECONNREFUSED` で死ぬ。
 *    → 検証スクリプトの最後は `process.exit(0)`。タブは閉じない。
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
 */

const PORT = 9333;
const BASE = `http://127.0.0.1:${PORT}`;

class Session {
  constructor(ws, targetId) {
    this.ws = ws;
    this.targetId = targetId;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      const resolve = this.pending.get(msg.id);
      if (resolve) {
        this.pending.delete(msg.id);
        resolve(msg);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve) => this.pending.set(id, resolve));
  }

  /** 読み込みを待ってから返る（落とし穴3）。 */
  async goto(url, settleMs = 700, timeoutMs = 20000) {
    const loaded = new Promise((resolve) => {
      const onMessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.method === "Page.loadEventFired") {
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
    await this.send("Page.navigate", { url });
    await loaded;
    // 水和（React が動き出す）ぶんだけ待つ
    await new Promise((r) => setTimeout(r, settleMs));
  }

  /** Cookie は `document.cookie` でなくここから入れる（落とし穴1）。 */
  async setCookie(name, value, url) {
    await this.send("Network.setCookie", { name, value, url, path: "/" });
  }

  /** 画面幅を変える。SP は 390x844 / PC は 1280x900 で測っている。 */
  async setViewport(width, height, mobile = false) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: mobile ? 2 : 1,
      mobile,
    });
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
   * 🚨 **呼ばないこと**（落とし穴2）。最後のタブを閉じると headless Chrome ごと終わる。
   * 残しておくのは、タブを複数開いたときに片付けられるようにするため。
   */
  async closeTab() {
    await fetch(`${BASE}/json/close/${this.targetId}`).catch(() => {});
  }
}

export async function open() {
  const res = await fetch(`${BASE}/json/new?about:blank`, { method: "PUT" });
  const target = await res.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  const session = new Session(ws, target.id);
  await session.send("Runtime.enable");
  await session.send("Page.enable");
  await session.send("Network.enable");
  return session;
}
