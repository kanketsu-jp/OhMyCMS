import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "@ohmycms/sdk";
import { createServer } from "./server.js";

/**
 * OhMyCMS の MCP サーバ（stdio）。
 *
 * 環境変数:
 *   OHMYCMS_URL    接続先（既定 http://localhost:3102 = Studio の開発ポート）
 *   OHMYCMS_TOKEN  エージェントトークン。**ログにも応答にも出さない**
 *
 * 🚨 stdio は MCP の通信路そのものなので、**stdout に何も書いてはいけない**。
 * 起動時のメッセージやエラーは必ず stderr へ出す。
 */
async function main(): Promise<void> {
  const baseUrl = process.env.OHMYCMS_URL ?? "http://localhost:3102";
  const token = process.env.OHMYCMS_TOKEN;

  if (!token) {
    process.stderr.write(
      "警告: OHMYCMS_TOKEN が設定されていません。認証が要るツールはすべて 401 になります。\n",
    );
  }

  const client = createClient({ baseUrl, token });
  const server = createServer(client);

  await server.connect(new StdioServerTransport());
  // トークンは出さない。接続先だけ出す
  process.stderr.write(`ohmycms MCP サーバを起動しました (接続先: ${baseUrl})\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `ohmycms MCP サーバの起動に失敗しました: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
