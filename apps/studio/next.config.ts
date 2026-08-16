import type { NextConfig } from "next";
// 🚨 上限は 1 箇所から配る。ここに数字を書かない（同じ値をアプリ側の判定も使う）。
import { proxyBodyLimitBytes } from "./lib/files/upload-limit";

const nextConfig: NextConfig = {
  // Docker (docker/Dockerfile) で最小構成の runner イメージを作るための出力形式。
  // .next/standalone に server.js と実行に必要な node_modules だけが出る。
  output: "standalone",

  // 何を使っているかを応答で名乗らない（既定は `X-Powered-By: Next.js` が付く）。
  // 攻撃を防ぐ力は無いが、版に紐づく既知の穴を探す手間をこちらから減らしてやる理由も無い。
  poweredByHeader: false,

  // Knex は全DBドライバ(mysql/sqlite3/oracledb 等)を動的 require するため、
  // バンドラが未インストールのドライバまで解決しようとして build が落ちる。
  // Node.js のネイティブ require に委ねることで回避する。
  // 参照: node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverExternalPackages.md
  serverExternalPackages: ["knex", "pg", "sharp"],

  experimental: {
    // アップロードの受け口の上限。**既定は 10,485,760（ちょうど 10MB）**で、
    // 🚨 そのため `lib/files/service.ts` の上限判定へ**一度も到達していなかった**
    //    （2026-08-16 実測: 9MB 通る / 9.996MB 落ちる / 10MB 落ちる。
    //      既定値と境目が一致した）。利用者には HTTP 500 が返っていた。
    // 🚨 `proxy.ts` が在るので、この上限が要求の入口で効く。
    // 🚨 **数字を直書きしない。** `lib/files/upload-limit.ts` が唯一の出どころで、
    //    アプリ側の判定も同じ値から配る（片方だけ直すと、通す門と落とす門が食い違う）。
    //    ここはアプリ側より 1MB 大きい（多重部分の飾りのぶん。理由は upload-limit.ts）。
    proxyClientMaxBodySize: proxyBodyLimitBytes(),
  },

  /**
   * 全応答に付ける安全側のヘッダ。
   *
   * 🚨 **ここに置く理由**: `proxy.ts` の matcher は `_next/static` などを外しているので、
   *    そこから配られる JS/CSS/画像には付かない。`headers()` は静的資産にも付く。
   *    `X-Robots-Tag` が `proxy.ts` に在るのは、あちらが「画面の応答だけで足りる」ものだから
   *    ではなく、**先に入っていたから**。新しく足すぶんはこちらへ寄せる。
   *
   * 🚨 **HSTS と CSP はここに入れない**（2026-08-17 時点・判断ボードへ回っている）。
   *    HSTS … ブラウザが期限つきで**覚える**ので、間違えたときに取り消せない。
   *    CSP  … 締めすぎると画面が動かなくなる。入れるなら段階を踏む（Report-Only から）。
   */
  async headers() {
    return [
      {
        // すべての経路。API の JSON も、アップロードしたファイルの応答も含む。
        source: "/:path*",
        headers: [
          {
            // ブラウザに Content-Type を推測させない。
            // 🚨 これが無いと、`Content-Disposition: attachment`（AGENTS.md §3.4）を
            //    「中身を見て HTML/SVG だと思ったから描画する」で回避されうる。
            // 個別の応答（`lib/files/service.ts`・SAML metadata）は既に自前で付けているが、
            // **付け忘れた口が黙って抜ける**ので、全応答の既定としてもここに置く。
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            // 他サイトの frame に入れさせない（クリックジャッキング）。
            // 🚨 `DENY` にできるのは、この管理画面が**自分自身を frame に入れていない**から
            //    （実測 2026-08-17: `iframe` の一致は Storybook と受入の台だけで、
            //     どちらも別のサーバ :3104 なのでこのヘッダの影響を受けない）。
            // CSP の `frame-ancestors` が本命だが、CSP はまだ入れないので当面こちらで塞ぐ。
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            // 外部サイトへ遷移するとき、URL を渡さない。
            // 🚨 この CMS の URL には**コレクション名と item の id** が入る
            //    （例: `/admin/collections/<名前>/<id>`）。外へ出す理由が無い。
            // 同一オリジンの中では従来どおり渡す（自前の遷移の解析を壊さないため）。
            key: "Referrer-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
