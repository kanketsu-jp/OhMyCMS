import type { NextConfig } from "next";
// 🚨 上限は 1 箇所から配る。ここに数字を書かない（同じ値をアプリ側の判定も使う）。
import { proxyBodyLimitBytes } from "./lib/files/upload-limit";

const nextConfig: NextConfig = {
  // Docker (docker/Dockerfile) で最小構成の runner イメージを作るための出力形式。
  // .next/standalone に server.js と実行に必要な node_modules だけが出る。
  output: "standalone",

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
};

export default nextConfig;
