---
name: cms-knowledge-author
description: cms のナレッジを書く・直すときに使う。未執筆や古くなった説明（permissions, architecture, i18n など）を、根拠のある形で書き足す。
---

<!-- rag-okf:start -->
# cms のナレッジを書く

- ナレッジの場所: `knowledge/`
- この案内が作られた時点のコミット: `9860fa5`

## 書く順番

1. **`rag-okf plan` を読む。** 何が未執筆で、何が古いかは機械が知っています。**自分で探さない**
2. **素材を読む。** 対象の実ファイルを実際に開く
3. **保存する。** MCP なら `knowledge_write`、CLI なら `rag-okf write --from-file <json>`

## 守ること

- 🚨 **実際に読んだファイルだけを `sources` に挙げてください。** 読んでいないものを根拠にしない
- 🚨 **`authorship: human` のドキュメントを上書きしない**（人が書いた説明を機械が消さない）
- **type ごとの節構成に従う。** 節を勝手に増減させない
- **基準日を書く。** 「いま何をしているか」「決定」は、いつ時点の話かを本文に明記する
- **うまくいった手順は `runbook` として書き残す。** 一度きりの成功で終わらせない

## 宿題が出たとき

編集の直後に「この説明が古くなります」と名指しされたら、**その場で直してください**。
あとで思い出す前提にしないための仕組みです。

## 領域

- areas/acceptance.md
- areas/apps-studio.md
- areas/design-system.md
- areas/permissions.md
<!-- rag-okf:end -->
