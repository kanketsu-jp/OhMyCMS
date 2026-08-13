/**
 * 依存を増やさないための最小 MCP クライアント（stdio / JSON-RPC 2.0）。
 *
 * ハーネスは「依存0本」が方針なので、@modelcontextprotocol/sdk は使わない。
 * stdio トランスポートは **改行区切りの JSON-RPC** なので、これだけで喋れる。
 * 自前で喋ることには副産物があり、**サーバが本当に生のプロトコルに従っているか**も
 * 同時に確かめられる（SDK 同士だと、SDK のバグは打ち消し合って見えない）。
 *
 * 🚨 stdout は通信路そのもの。サーバが stdout に余計なものを書くとここでパースが壊れる。
 *   それも含めて検査したいので、パースできない行は捨てずに stray として記録する。
 */

import { spawn } from "node:child_process";

const PROTOCOL_VERSION = "2025-06-18";

export class McpStdioClient {
  /**
   * @param {string} command  実行するコマンド（例 process.execPath）
   * @param {string[]} args   引数（例 [".../packages/mcp/dist/index.js"]）
   * @param {object} env      追加の環境変数
   */
  constructor(command, args, env = {}) {
    this.command = command;
    this.args = args;
    this.env = env;
    this.nextId = 1;
    /** @type {Map<number, {resolve:Function, reject:Function}>} */
    this.pending = new Map();
    /** stdout に流れてきた JSON でない行。0 件であるべき */
    this.stray = [];
    /** stderr の中身。トークン漏れの検査に使う */
    this.stderr = "";
    this.buffer = "";
    this.child = null;
  }

  async start() {
    this.child = spawn(this.command, this.args, {
      env: { ...process.env, ...this.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.child.stdout.on("data", (chunk) => this.#onStdout(String(chunk)));
    this.child.stderr.on("data", (chunk) => (this.stderr += String(chunk)));
    this.child.on("error", (error) => {
      for (const { reject } of this.pending.values()) reject(error);
      this.pending.clear();
    });
    this.child.on("close", () => {
      for (const { reject } of this.pending.values()) {
        reject(new Error("MCP サーバが応答前に終了しました"));
      }
      this.pending.clear();
    });

    const initialized = await this.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "ohmycms-acceptance", version: "0.1.0" },
    });
    this.notify("notifications/initialized");
    return initialized;
  }

  #onStdout(text) {
    this.buffer += text;
    let index = this.buffer.indexOf("\n");
    while (index !== -1) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (line !== "") this.#onLine(line);
      index = this.buffer.indexOf("\n");
    }
  }

  #onLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      // stdout に JSON 以外が出た＝プロトコルが壊れている。捨てずに残す。
      this.stray.push(line);
      return;
    }
    if (typeof message.id !== "number") return; // 通知は使わない
    const waiter = this.pending.get(message.id);
    if (!waiter) return;
    this.pending.delete(message.id);
    if (message.error) {
      waiter.reject(
        Object.assign(new Error(message.error.message ?? "JSON-RPC エラー"), {
          rpcError: message.error,
        }),
      );
      return;
    }
    waiter.resolve(message.result);
  }

  #send(payload) {
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  notify(method, params = {}) {
    this.#send({ jsonrpc: "2.0", method, params });
  }

  request(method, params = {}, { timeoutMs = 30_000 } = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} が ${timeoutMs}ms で応答しませんでした`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.#send({ jsonrpc: "2.0", id, method, params });
    });
  }

  listTools() {
    return this.request("tools/list", {});
  }

  /**
   * ツールを呼ぶ。**エラーでも throw しない**（拒否されたことが実測値なので）。
   * @returns {Promise<{isError:boolean, structured:object|null, text:string}>}
   */
  async callTool(name, args = {}) {
    const result = await this.request("tools/call", { name, arguments: args });
    const text = (result.content ?? [])
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n");
    return {
      isError: result.isError === true,
      structured: result.structuredContent ?? null,
      text,
    };
  }

  async stop() {
    if (!this.child) return;
    this.child.stdin.end();
    this.child.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
