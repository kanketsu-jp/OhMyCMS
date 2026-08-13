/**
 * V1-A: **SAML（SSO）**  担当 auth(w4A:p9)
 *
 * 🚨 **実装より先に基準を書いている。実装側はこの形で測られる。**
 *
 * ─────────────────────────────────────────────────────────────
 * 【テスト IdP をどうするか】司令塔から「調べて提案してください」と言われた件。
 *
 * **結論: 公開テスト IdP を使わない。`quay.io/keycloak/keycloak` をコンテナで立てる。**
 *
 * 実測（2026-08-13）:
 *   `samltest.id`                     → **到達不可（HTTP 000）**
 *   `kristophjunge/test-saml-idp`     → amd64 のみ・最終更新 **2018-02-04**（8年前）
 *   `keycloak/keycloak`               → **arm64 対応**・最終更新 2026-08-13
 *   この Mac の docker ホスト          → **arm64**
 *
 * 理由:
 *   ① **公開 IdP は外部依存で、落ちたら受入が丸ごと止まる。**
 *      今日それを一度踏んでいる（studio-acc が `next/font/google` の 404 で全経路 500 になった。
 *      「外にある物が黙って変わる」と、こちらのコードは何も変えていないのに落ちる）。
 *      受入ハーネスが外部サービスに依存すると、**FAIL が製品の問題か外の問題か区別できなくなる**。
 *   ② 公開 IdP には**こちらの SP メタデータを登録**する必要があり、手作業が挟まる＝自動化できない。
 *   ③ `kristophjunge/test-saml-idp` は arm64 が無く、この Mac ではエミュレーションになる。
 *      8年前のイメージでもある。
 *   ④ Keycloak なら **IdP の設定を API で流し込める**ので、受入の準備までコードにできる。
 *
 * 🚨 ただし**未実測**（unverified）: Keycloak を実際に立てて SAML の応答を返させるところまでは
 *   まだ試していない。イメージの存在とアーキテクチャだけを確かめた段階。
 *   ポートは `knowledge/decisions/port-allocation.md` に**空きを取ってから**決める（:3107 を提案）。
 * ─────────────────────────────────────────────────────────────
 *
 * 測るもの（肯定形と否定形をセットで）:
 *   🟢 IdP でログイン → **CMS のセッションが張られ、管理画面に入れる**
 *   🟢 **既存の利用者と結びつく**（同じメールなら別人が増えない）
 *   🔴 🚨 **署名が違う Assertion を拒否する**
 *      ← ここが SAML の急所。**自分で作った署名なしの Assertion を投げて 4xx になること**を見る。
 *        これが通ると、**誰でも管理者になれる**
 *   🔴 **期限切れ（NotOnOrAfter を過ぎた）Assertion を拒否する**
 *   🔴 **別の宛先（Audience が違う）Assertion を拒否する**
 *   🔴 **同じ Assertion を2回使えない**（リプレイ）
 *   🔴 🚨 **SAML を有効にしても、パスワードの経路が黙って無効にならない**
 *      （締め出しの防止。OTP と同じ論点）
 *
 * 🚨 対照実験: 否定形の4つは「**エンドポイントが常に 4xx を返すだけ**」でも全部通る。
 *   だから **🟢 正しい Assertion が通る**ことを先に確かめる。それが無いと何も証明していない。
 */

import { result, STATUS } from "../lib/result.mjs";

export async function check(context) {
  const started = Date.now();
  const { baseUrl } = context;

  // 実装されているか（推測せず対象に聞く）
  const metadata = await fetch(`${baseUrl}/api/auth/saml/metadata`, { redirect: "manual" })
    .catch(() => null);

  if (!metadata || metadata.status === 404) {
    return result({
      id: 13,
      title: "V1-A SAML（SSO）",
      status: STATUS.SKIP,
      reason: "SAML の入口がまだありません（/api/auth/saml/metadata が 404）",
      details: [
        "実装が来たら本物へ切り替えます。**測る内容を先に置いておきます**:",
        "  🟢 IdP でログイン → CMS のセッションが張られ、管理画面に入れる",
        "  🟢 既存の利用者と結びつく（同じメールで別人が増えない）",
        "  🔴 🚨 **署名が違う / 署名が無い Assertion を拒否する**（ここが急所）",
        "  🔴 期限切れ（NotOnOrAfter 超過）を拒否する",
        "  🔴 Audience が違うものを拒否する",
        "  🔴 同じ Assertion を2回使えない（リプレイ）",
        "  🔴 🚨 SAML を有効にしてもパスワードの経路が黙って無効にならない（締め出し防止）",
        "",
        "🚨 **テスト IdP は公開サービスを使わず、Keycloak のコンテナで立てることを提案します。**",
        "  実測: samltest.id は現在**到達不可**（HTTP 000）。",
        "        kristophjunge/test-saml-idp は amd64 のみ・2018年で更新停止。",
        "        keycloak/keycloak は arm64 対応・今日も更新あり。この Mac は arm64。",
        "  外部の IdP に依存すると、**FAIL が製品の問題か外の問題か区別できなくなります**",
        "  （今日 studio-acc が Google Fonts の 404 で全経路 500 になったのと同じ形）。",
        "  ポートは :3107 を提案（port-allocation.md へ登録してから使う）。",
        "  🚨 Keycloak で実際に SAML 応答を返させるところは **未実測**です。",
      ],
      ms: Date.now() - started,
    });
  }

  return result({
    id: 13,
    title: "V1-A SAML（SSO）",
    status: STATUS.BLOCKED,
    reason: `入口はあります（HTTP ${metadata.status}）が、テスト IdP がまだありません`,
    details: [
      "SP のメタデータが出るようになりました。次は IdP 側（Keycloak :3107）を立てます。",
      "🚨 否定形の4つは「常に 4xx を返す実装」でも全部通るので、",
      "   **正しい Assertion が通ること**を対照として先に置きます。",
    ],
    ms: Date.now() - started,
  });
}
