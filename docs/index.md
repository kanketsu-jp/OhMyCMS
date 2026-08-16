# Docs Index

`docs/` は素材（調査結果・設計途中・裁定待ち）の置き場（`AGENTS.md` §8）。
新しいファイルを足したら、ここにも 1 行足すこと（`knowledge/index.md` と同じ作法）。
足し忘れは `apps/studio/scripts/check-docs-index.mjs` が検出して止める。

## Entries

- [Dokploy へのデプロイ手順（OhMyCMS）](./deploy/dokploy.md) — clone→build→HTTP 200 の手順
- [AI ガイド型オンボーディング（ストレージ/Cloudflare 設定の自動化）](./design/ai-guided-onboarding-storage.md) — OhMyCMS の MCP 連携でオンボーディング中に Cloudflare 設定まで案内する設計素材
- [API 濫用ロック ＆ OpenTelemetry 連携（運用ハードニング）](./design/api-abuse-lock-and-otel.md) — 同一キーの大量アクセスを一時ロックし、OTel と連携しやすくする設計素材
- [採らなかった案: ラベルの一意制約を部分索引にする](./design/labels-unique-partial-index-rejected.md) — 消した名前を空けると戻せなくなる。不採用の理由と、使い捨て DB での実測
- [ライセンスキー — 発行 / 検証 / 失効の設計](./design/license-keys.md) — 発行・検証・失効の実装設計（課金/プラン/UIは対象外）
- [右パネル ⑤ ログ・履歴 — 設計（範囲 B: ログを本物にする）](./design/panel-logs-history.md) — Codex/Sonnet へ渡す実装仕様（検証は security 担当・委譲不可）
- [【未決】フィールド名を日本語で付けられるようにする（directus_fields.translations）](./design/pending-field-display-name.md) — 実装仕様は完成、堀池の承認待ち
- [設計: リカバリーコード（最後の1人が締め出されたときの入口）](./design/recovery-code.md) — key-gen で作るリカバリーコードでログインする設計
- [設計: SSO のみのログインへ切り替える（締め出しを起こさずに）](./design/sso-only-switchover.md) — 状態: 裁定待ち。初回 Admin の割当を SSO 移行時にどう扱うか
- [設計: SSO で誰を入れるか（許可リストと「全員付与」）](./design/sso-user-provisioning.md) — 状態: 裁定待ち。メアド許可リストと役割一括付与の設計
- [設計: 人を何で識別するか（メールを必須でなくす）](./design/user-identifier.md) — 環境変数での初回ログインとメール任意化の設計
- [X の実物観察 — Mobbin で引いた画面と、そこから決めた値](./design/x-ui-observations.md) — 静止画観察に基づく推定値（DevTools 実測ではない）
- [X (旧Twitter) 由来 — OhMyCMS 管理画面デザイン規約](./design/x-ui-rules.md) — X Web UI を数値・規則として再現可能な形に落とした規約
- [CI「Docker で起動して /api/health が 200」が落ちた 2 件（2026-08-16）](./research/ci-docker-migrate-failure-2026-08-16.md) — 未解明のまま記録した 2 通りの落ち方（unverified）
- [日本語/英語がUIに与える影響 — OhMyCMS 管理画面デザイン規約 一次調査](./research/ja-en-ui-evidence.md) — 日本語UIの数値ルールを立てるための一次エビデンス
- [マルチテナントの Postgres 戦略（RLS / schema / パーティション）— 調査](./research/multi-tenant-postgres.md) — 認可の強制点を app 層/DB 層のどちらに置くかの検討材料
- [OhMyCMS 一次調査: AGENTS.md 運用 と Next.js 16 知識ベース](./research/nextjs16-and-agents-md.md) — AGENTS.md 運用と Next.js 16 の一次情報調査
- [手で確かめるもの（admin/files）— 実機・ブラウザ・実クライアント ID が要る分](./verify/files-manual-checks.md) — 誰でも使える手動検証手順（一部は道具を知れば機械でも測れた）
- [初回起動の環境を立てる — 共有環境では誰も到達できない経路を踏むために](./verify/first-run-environment.md) — 共有ポート(3101/3102/3103/5436)に触れない初回起動環境の作り方
