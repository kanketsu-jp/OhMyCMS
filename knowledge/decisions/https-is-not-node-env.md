---
type: decision
title: 通信路が HTTPS かどうかを NODE_ENV で決めない
description: Cookie の Secure 属性を「本番ビルドか」で決めていたため、平文 HTTP の LAN アドレスで開いたオーナーがログインできなくなった。本番ビルドを平文で配ることは普通にあり、curl では再現しない。
tags: [auth, security, cookie, https, verification]
status: active
sources:
  - resource: "repo://apps/studio/lib/auth/cookies.ts"
stale_after: 2027-02-13
x_rag_okf:
  id: decisions/https-is-not-node-env
  authorship: agent
---

# 通信路が HTTPS かどうかを NODE_ENV で決めない

> 由来: 2026-08-13。堀池（オーナー）が `http://192.168.1.14:3101` から管理画面に入れなくなった。
> 「ここから進めない。オンボーディングが始まらない」。

## TL;DR

**「本番かどうか」と「HTTPS かどうか」は別の問い。**
Cookie の `Secure`、署名付き URL のスキーム、SAML の ACS URL——
**通信路の性質は、実際の要求から決める**（`x-forwarded-proto` またはリクエストの URL）。

## 1. 何が起きたか

`lib/auth/cookies.ts` が Cookie の `Secure` をこう決めていた:

```ts
secure: process.env.NODE_ENV === "production"
```

本番ビルドなので `Secure` が付く。ところが**配信は平文 HTTP の LAN アドレス**だった。

🚨 **ブラウザは、安全でない文脈からの `Secure` 付き Cookie を保存しない。**

実測（同じアプリ・同じビルド・ブラウザで）:

| 開いた URL | ブラウザが保持した Cookie |
|---|---|
| `http://localhost:3101` | 保持する（**localhost は例外的に安全な文脈**として扱われる） |
| `http://192.168.1.14:3101` | 🚨 **0 件** |

症状は「**ログインは 200 を返すのに、次の画面で弾かれる**」。
サーバから見ると成功しているので、**ログにも DB にも異常が残らない**。

## 2. なぜ見つけにくかったか

🚨 **`curl` では絶対に再現しない。** `Secure` を強制するのは**ブラウザ**であって、サーバでも curl でもない。

    curl -X POST .../api/auth/setup   → 200（Set-Cookie も返る）
    ブラウザで同じことをする          → 200 だが **Cookie は保存されない**

`AGENTS.md §4`「curl でソースが取れたを表示確認と書かない」は**認証にも当てはまる**。
**Cookie を受け入れるかどうかはブラウザの仕事**なので、curl は検証にならない。

さらに、**開発者は `localhost` で試す**。localhost だけが例外的に通るので、
**開発中はまず気づけない**。気づくのは「別の端末から開いた人」——つまり**利用者**である。

## 3. 決定

**通信路の性質は、実際の要求から判定する。**

```ts
export function isSecureRequest(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0]?.trim() === "https";
  return new URL(request.url).protocol === "https:";
}
```

- **HTTPS で配信していれば `Secure` は必ず付く**（下げてよいのは平文のときだけ）
- リバースプロキシ越しは `x-forwarded-proto` を見る

## 4. 同じ判断が要る場所

| 対象 | 何を間違えるか |
|---|---|
| **Cookie の `Secure`** | 平文で配ると Cookie が保存されず、ログインできない（本件） |
| **署名付き URL**（ストレージ） | 発行した URL のスキームが実際の配信と食い違い、リンクが切れる |
| **SAML の ACS URL** | IdP へ渡す戻り先が食い違い、認証が完了しない |

**「本番ビルド＝HTTPS」は思い込み。** 本番ビルドを平文で配ることは普通にある
（LAN・社内・検証機・トンネル前の確認）。

## 5. アンチパターン

- ❌ `NODE_ENV === "production"` で `Secure` / スキーム / 外部へ渡す URL を決める
- ❌ `curl` が 200 を返したことを「ログインできる」の証明にする
- ❌ `localhost` だけで確認して「動く」と結論する（**localhost は例外的に通る**）
- ❌ 逆に、HTTPS なのに `Secure` を外す（平文のときだけ下げる）

## 6. レビュー観点

- [ ] Cookie の `Secure` を、要求のスキーム（`x-forwarded-proto` 含む）から決めているか
- [ ] 外部へ渡す URL（署名付き URL / ACS URL / リダイレクト先）を同じ基準で組み立てているか
- [ ] 認証の確認を **ブラウザ**で行ったか（curl だけで済ませていないか）
- [ ] **localhost 以外のホスト名**でも確認したか
