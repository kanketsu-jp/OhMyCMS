# モバイルファーストの実装パターン（固定フッター・ボトムシート・コピー）

> 対象は「スマホで読んで、その場で答えて、コピーして貼る」画面。
> **PC は widen した結果**であって、PC で作ってから縮めない。

## 0. モバイルファーストの書き方

**素の CSS がモバイル。広い画面だけをメディアクエリで上書きする。**

```css
/* 素 = モバイル */
.wrap { padding: 0 16px; }
.mast h1 { font-size: 24px; }

/* 広い画面だけ上書き。ブレークポイントは 1 つ */
@media (min-width: 768px) {
  .wrap { padding: 0 20px; }
  .mast h1 { font-size: 32px; }
}
```

❌ `max-width` で縮めていく書き方（PC ファースト）にしない。
モバイルの指定が「例外」の位置に来ると、SP の見た目が常に後回しになる。

## 1. 画面下部の固定ボタン（SP の主経路）

スマホでは、**回答し終わったところに操作がある**必要がある。上部のボタンは
スクロールで見えなくなるので、コピーは画面下に固定する。

```css
.dock {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 40;
  background: var(--bg);
  border-top: 1px solid var(--border);
  /* ホームバー/丸角にボタンが食われないよう safe-area を足す */
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
}
/* 固定バーの下にコンテンツが潜り込むのを防ぐ */
body { padding-bottom: calc(76px + env(safe-area-inset-bottom)); }

@media (min-width: 768px) { .dock { display: none; } }   /* PC は上部ボタンに寄せる */
```

🚨 **`env(safe-area-inset-bottom)` を忘れない。** iPhone のホームインジケータに
ボタンが重なって押せなくなる。`viewport-fit=cover` を指定していない環境では
`env()` は 0 になるだけなので、**書いておいて損はない**。

🚨 **`body` に下 padding を入れ忘れると、最後の設問がバーに隠れて永遠に選べない。**
バーの高さ（＋ safe-area）ぶんを必ず空ける。

### 高さの単位

画面いっぱいの要素には **`dvh`**（動的ビューポート）を使う。`vh` は iOS Safari の
アドレスバーが縮む前提の値なので、**下が見切れる**。

```css
.sheet { max-height: 88dvh; }
@supports not (max-height: 88dvh) { .sheet { max-height: 88vh; } }
```

## 1.5 下層ページ構成（1 つの HTML の中でページを分ける）

スマホで終わらないスクロールを作らないため、**1 枚の HTML に `<section data-page>` を並べ、
目次（`home`）から降りる**。ページ間の移動は表示の切り替えだけで、ファイルは 1 つのまま。

```js
function go(id, push) {
  pages.forEach(p => p.classList.toggle('is-on', p.dataset.page === id));
  $('top-t').textContent = id === 'home' ? DOC.title : sec.dataset.title;
  $('btn-back').hidden = id === 'home';
  window.scrollTo(0, 0);                                   // ページを変えたら必ず先頭へ
  if (push !== false) { try { location.hash = '#/' + id; } catch (e) {} }
  refresh();                                               // ← ヘッダの件数を出し直す
}
window.addEventListener('hashchange', …);                  // 戻る/進むに追随
```

- `location.hash` を使うと**ブラウザバックで前のページへ戻れる**。
  iframe で hash を書けない環境もあるので **try/catch で囲み、失敗しても遷移は成立させる**
- 遷移のたびに `window.scrollTo(0,0)`。**前のページのスクロール位置が残ると、
  新しいページの途中から始まったように見える**

### 🚨 ヘッダの件数は「いま見ているページ」のスコープ

ページを分けたのにヘッダが全体件数（`1/20`）のままだと、**分けた意味が消える**。

```js
const scope = current === 'home'
  ? { done: totalDone, all: qs.length }   // トップだけ全体
  : pageStat(current);                    // 下層はそのページ（設問が無ければ null）
$('top-n').hidden = !scope;               // 設問を持たないページでは件数を出さない
```

全体の進捗は**画面下のバー（`全体 7/20`）とメニュー**に置く。同じ数字を 2 か所に出さない。

### 完了したページを目次の下部へ落とす

トップは「まだ答えていないもの」が主役。終わったカードは**消さずに下へ移す**。

```js
const target = isDone ? $('list-done') : $('list-todo');
if (card.parentElement !== target) target.appendChild(card);
// 元の順序を保つ（並び替えではなく「移動」に見せるため）
Array.from(list.children).sort((a,b) => a.dataset.order - b.dataset.order)
  .forEach(c => list.appendChild(c));
```

`data-order` を初期化時に振っておかないと、**移動のたびに順番が入れ替わって別物に見える**。

## 2. ボトムシート（コピー用モーダル）

固定ボタンを押したら、**画面下から出るシート**でコピー内容を見せる。
実装は `<dialog>` + `showModal()`。

```html
<dialog class="sheet" id="sheet" aria-labelledby="sheet-title"> … </dialog>
```
```css
dialog.sheet {
  border: 0; padding: 0; margin: 0;
  position: fixed; inset: auto 0 0 0;     /* 下に貼り付ける */
  width: 100%; max-height: 88dvh;
  border-radius: 16px 16px 0 0;
}
dialog.sheet::backdrop { background: rgba(0,0,0,.45); }

@media (min-width: 768px) {               /* PC は中央のダイアログにする */
  dialog.sheet { inset: 0; margin: auto; width: min(720px, calc(100% - 40px)); border-radius: 12px; }
}
```

**`<dialog>` を選ぶ理由**: Esc で閉じる・フォーカスがシート内に閉じる・背面が
`inert` になる・`::backdrop` が使える——これらが**何も書かずに付いてくる**。
背景タップで閉じる挙動だけは自分で足す:

```js
sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); });
```

### CSS だけで作りたい場合（JS を持たない画面）

参考記事（[Qiita / maabow](https://qiita.com/maabow/items/9757a25eb5a8badaeb28)）は
**checkbox / `<details>` / `:target`** の 3 パターンを挙げ、`:target` を最もスマートとしている。
`:target` は URL の hash を使うので**ブラウザバックで閉じられる**のが利点、
**hash が汚れる / 履歴が増える**のが欠点。

本テンプレートは出力文字列を JS で組み立てる以上、JS は必ず載る。
**JS があるなら `<dialog>` の方が事故が少ない**ので、CSS のみのパターンは採らない。

## 3. アコーディオン（判断に効く事実の折りたたみ）

SP では「事実の表」を常時開いておくと 1 設問が画面を埋めるので、`<details>` で畳む。

```css
.facts > summary {
  display: flex; align-items: center; gap: 8px;
  list-style: none;          /* 既定の三角を消す */
  min-height: 44px;          /* タップ領域 */
  cursor: pointer;
}
.facts > summary::-webkit-details-marker { display: none; }  /* Safari 18.4 未満 */
.facts > summary::after {    /* 自前のシェブロン */
  content: ""; margin-left: auto; width: 8px; height: 8px;
  border-right: 2px solid currentColor; border-bottom: 2px solid currentColor;
  transform: rotate(45deg); transition: transform .2s ease;
}
.facts[open] > summary::after { transform: rotate(-135deg); }
```

- **`list-style: none` と `::-webkit-details-marker` の両方を書く**
  （[ics.media](https://ics.media/entry/220901/)。Safari 18.4 未満は後者が要る）
- 開閉の**高さアニメーションはやらない**。`::details-content` は Chrome/Edge のみ、
  Web Animations API 版は連打対策（`dataset` でのフラグ管理）と二重 div が要る。
  **実用ドキュメントに見合わない複雑さ**なので、シェブロンの回転だけにする
- `name` 属性でのグループ化（1 つ開くと他が閉じる）は Safari 未対応。使わない

## 4. コピーの二本立て（JSON と 文章）

**同じ回答を 2 つの形で出せるようにする。**

| 形式 | 用途 |
|---|---|
| **文章** | 既定。そのままチャットへ貼れる。人が読んで確認できる |
| **JSON** | 機械で受け取るとき。`answers[]` と `unanswered[]` を持つ |

タブで切り替え、**表示している方をコピーする**（ボタンを 2 つ並べない。
押し間違えて別形式を貼る事故のほうが多い）。

```js
if (navigator.clipboard && navigator.clipboard.writeText) {
  navigator.clipboard.writeText(text).then(ok).catch(fallback);
} else { fallback(); }

function fallback() {          // 権限が無い環境では「手で取れる形」に落とす
  ta.focus(); ta.select();
  toast('選択しました。⌘C / 長押しでコピー');
}
```

🚨 **Clipboard API は失敗しうる**（iframe の権限・非 secure context・ユーザー操作外）。
**必ず `<textarea>` に内容を出しておき、失敗したら選択状態にする。**
「コピーしました」とだけ言って実際は空、が最悪の結果。

出力の `<textarea>` は `readonly` にする（誤編集を防ぐ）。`disabled` にはしない
（**選択できなくなってフォールバックが死ぬ**）。

## 5. 回答の保持

`localStorage` に保存し、読み込み時に復元する。**スマホは離脱しやすい**ので必須。

```js
try { localStorage.setItem(key, JSON.stringify(o)); } catch (e) {}
```

🚨 **必ず try/catch。** プライベートモードや sandbox された iframe では例外になり、
**囲っていないとフォーム全体が動かなくなる。**保存できないのは許容、動かないのは不可。

## 6. レビュー観点

- [ ] 素の CSS がモバイルで、`min-width` だけで広げているか
- [ ] ページ遷移で先頭までスクロールし、ヘッダの件数がそのページのものに変わるか
- [ ] 完了したカードが消えずに下部へ移り、順序が保たれているか
- [ ] 固定バーに `env(safe-area-inset-bottom)` があるか
- [ ] `body` に固定バーぶんの下 padding があるか
- [ ] 全画面高に `dvh` を使っているか（`vh` のままにしていないか）
- [ ] `<details>` の marker を 2 通りとも消しているか
- [ ] コピーが失敗したとき、手で選択できる状態になるか
- [ ] `localStorage` を try/catch で囲っているか
- [ ] タップできるものが 44px 以上か
