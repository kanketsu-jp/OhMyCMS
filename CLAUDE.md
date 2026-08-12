# CLAUDE.md — OhMyCMS

このプロジェクトの指示書の**正本は `AGENTS.md`** です。Claude Code は `AGENTS.md` を自動では読まないため、
ここからインポートします（出典: https://code.claude.com/docs/en/memory ）。

@AGENTS.md

---

## Claude Code 固有の補足

上の `AGENTS.md` が全エージェント共通のルール（Codex / Cursor / OpenCode にも同じものが届く）。
以下は Claude Code でだけ効く事柄なので、`AGENTS.md` には書かずここに置く。

### 応答は日本語

説明・コメント・報告はすべて日本語で書く。技術用語とコード識別子は原語のまま。

### ナレッジ基盤（rag-okf）

このリポジトリの `knowledge/` は `@kanketsu/rag-okf` が管理する。

- 検索: MCP `rag-okf` の `knowledge_search` / `knowledge_get`、または CLI `rokf search "<語>" --json`
- 書き込み: `knowledge_write`（**CLI は LLM を呼ばない。散文はエージェントが書く**）
- 鮮度検査: `rokf doctor`。索引が古い／秘密が混入している場合のみ落ちる
- ファイルを編集したあと「`areas/xxx` が古くなります」と名指しされたら、**その作業のついでに直す**

`rokf` は npm 未公開のため、ローカル（`~/Develop/Projects/kk2/rag-okf`）からグローバル導入している。
Node のバージョンを切り替えると PATH から消えることがある。

### 委譲

実装・多ファイル機械書換・調査は Codex / OpenCode / サブエージェントへ委譲する。
Claude 本体は計画・判断・**検証**に集中する。委譲の作法はグローバルルール（`~/.claude/skills/codex-delegation/`）に従う。

**作業者の「実装しました」を検証せずに信じない。** 受入基準は必ず実測で確認する。
