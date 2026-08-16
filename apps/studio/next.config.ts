import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker (docker/Dockerfile) で最小構成の runner イメージを作るための出力形式。
  // .next/standalone に server.js と実行に必要な node_modules だけが出る。
  output: "standalone",

  // Knex は全DBドライバ(mysql/sqlite3/oracledb 等)を動的 require するため、
  // バンドラが未インストールのドライバまで解決しようとして build が落ちる。
  // Node.js のネイティブ require に委ねることで回避する。
  // 参照: node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverExternalPackages.md
  serverExternalPackages: ["knex", "pg", "sharp"],

  // 開発サーバを ngrok 越しに見るときだけ要る。別ホストから来た開発用リソースを
  // Next が既定で拒否し、ログインの Server Action が黙って通らなくなるため。
  // 🚨 開発時のみ有効な設定で、本番のビルドには影響しない。
  //    列挙したホスト以外は従来どおり拒否される（＝全開放ではない）。
  allowedDevOrigins: ["kmdr-dev-2.ngrok.app"],
};

export default nextConfig;
