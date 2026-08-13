import { DEFAULT_URL } from "./context.js";
import { print } from "./output.js";

export const VERSION = "0.1.0";

export function printHelp(): void {
  print(`ohmycms — OhMyCMS をコマンドラインから操作する (v${VERSION})

使い方:
  ohmycms <コマンド> [サブコマンド] [オプション]

コマンド:
  health                                 API に繋がるか確認する
  whoami                                 いまの認証情報が誰なのかを表示する
  login                                  認証情報を保存する（--token / --dev-login）
  logout                                 保存した認証情報を消す

  collection list                        コレクション一覧
  collection create <名前>               コレクションを作る
  collection delete <名前>               コレクションを消す (テーブルごと消える)

  field add <コレクション> <フィールド>  フィールドを追加する
  field list <コレクション>              フィールド一覧

  item list <コレクション>               アイテム一覧
  item create <コレクション>             アイテムを登録する
  item get <コレクション> <ID>           アイテムを1件取る
  item delete <コレクション> <ID>        アイテムを消す

  user list                              ユーザー一覧 (管理者のみ)
  token create --name <名前>             エージェントトークンを発行する
  token list                             発行済みトークンの一覧 (トークン自体は表示されない)
  schema snapshot                        スキーマ全体を JSON で吐く

共通オプション:
  --url <URL>              接続先 (既定: ${DEFAULT_URL})
  --token <トークン>       エージェントトークンで認証する
  --session-token <値>     人間のセッションで認証する
  --json                   機械向けに JSON で出す (人間向けの装飾を出さない)
  -h, --help               このヘルプ
  -v, --version            バージョン

接続先と認証情報の決め方 (上ほど優先):
  1. フラグ          --url / --token / --session-token
  2. 環境変数        OHMYCMS_URL / OHMYCMS_TOKEN / OHMYCMS_SESSION_TOKEN
  3. 設定ファイル    ~/.config/ohmycms/config.json  (XDG_CONFIG_HOME を尊重)
  4. 既定値          ${DEFAULT_URL} (認証情報には既定値は無い)

  設定ファイルはディレクトリを 700、ファイルを 600 で作る。リポジトリ配下には保存しない。
  --token と --session-token を両方渡したときは --token (エージェント) が優先される
  (API 側が Bearer を先に見るため)。

終了コード:
  0 成功 / 1 一般エラー / 2 引数の誤り / 3 認証されていない (401)
  4 権限が足りない (403) / 5 見つからない (404) / 6 サーバへ接続できない

例:
  ohmycms login --dev-login you@example.test --admin    # 開発: 人としてログイン
  ohmycms login --token xxxxx --url http://localhost:3101  # 本番: トークンを預ける
  ohmycms collection create articles --field title:string --field views:integer
  ohmycms item create articles --data '{"title":"はじめての記事"}'
  ohmycms item list articles --filter '{"views":{"_gte":100}}' --sort -views --limit 5
  ohmycms schema snapshot --out schema.json

詳しいコマンド別のヘルプ:
  ohmycms <コマンド> --help`);
}

const SUBCOMMAND_HELP: Record<string, string> = {
  login: `ohmycms login — 認証情報を保存する

  OhMyCMS は二階建て認証なので、login も2通りある。

  ohmycms login --token <トークン> [--url <URL>]
      **エージェントとして**動く。管理画面や token create で発行したトークンを預かる。
      CI・自動化・本番はこちら。capabilities で権限が絞られる。

  ohmycms login --dev-login <メールアドレス> [--admin]
      **人としてログインする（開発時のみ）。** セッションを預かる。
      サーバ側で ALLOW_DEV_LOGIN=true かつ NODE_ENV!=production のときだけ動く。
      🚨 **トークンは発行しない。** capabilities の絞り込みが無いので、
      そのユーザーの権限がそのまま使える（items も設定も、権限があれば触れる）。
      絞ったトークンが要るときは、ログイン後に ohmycms token create で明示的に作る。

  オプション:
    --token <トークン>    エージェントトークンを保存する
    --url <URL>           接続先も一緒に保存する
    --dev-login <メール>  開発用ログインで人としてログインする
    --admin               dev-login のユーザーに管理者ポリシーを付ける

  ※ --token と --dev-login は同時に使えない（どちらで動いているか分からなくなるため）。
     後から login し直すと、前の認証情報は置き換えられる。`,

  logout: `ohmycms logout — 保存した認証情報を消す

  ohmycms logout             設定ファイルを削除する
  ohmycms logout --keep-url  認証情報だけ消して接続先は残す`,

  collection: `ohmycms collection — コレクション (テーブル) を操作する

  ohmycms collection list [--system]
  ohmycms collection create <名前> [--field <名前>:<型> ...] [--primary-key <名前>]
  ohmycms collection delete <名前> --yes

  --field は繰り返し指定できる。型は string / integer / bigInteger / decimal / float /
  boolean / json / uuid / date / time / dateTime。
  --field を1つも指定しないと id (uuid・主キー) だけのコレクションになる。
  delete はテーブルごと消えるので --yes が必須。`,

  field: `ohmycms field — フィールド (カラム) を操作する

  ohmycms field list <コレクション>
  ohmycms field add <コレクション> <フィールド> --type <型> [--required] [--max-length <n>]

  型: string / integer / bigInteger / decimal / float / boolean / json / uuid / date / time / dateTime`,

  item: `ohmycms item — アイテム (レコード) を操作する

  ohmycms item list <コレクション> [--filter <JSON>] [--fields a,b] [--sort -views] [--limit 20] [--page 2] [--count]
  ohmycms item get <コレクション> <ID>
  ohmycms item create <コレクション> --data '<JSON>'
  ohmycms item update <コレクション> <ID> --data '<JSON>'
  ohmycms item delete <コレクション> <ID> --yes

  --filter は API と同じ記法の JSON。例:
    --filter '{"status":{"_eq":"published"}}'
    --filter '{"_and":[{"views":{"_gte":100}},{"status":{"_neq":"draft"}}]}'
  --count を付けると総件数 (total_count / filter_count) も取る。`,

  token: `ohmycms token — エージェントトークンを発行・管理する

  ohmycms token create --name <名前> [--expires-in-days <1-365>]
                       [--admin-capability <csv>] [--collection-capability <名前>[:<動作,...>]]
  ohmycms token list [--all]      失効済みは既定で隠す。--all で全部出す
  ohmycms token delete <ID>

  🚨 **人間のセッションが必要**（エージェントトークンでは 403 HUMAN_AUTH_REQUIRED）。
  ohmycms login --dev-login でログインしていればそのまま使える。
  そうでなければ --session-token <生トークン> か環境変数 OHMYCMS_SESSION_TOKEN を渡す。

  capabilities の指定は「絞る」ためのもの。**指定の仕方で既定が逆になるので注意**:
    何も指定しない
        → items は委任元ユーザーの権限をそのまま継承。**管理操作は全部 403**
    --admin-capability だけ指定
        → 管理操作はできるが、**items が全部 403 になる**
          (API は capabilities があると collections の完全一致でしか items を許さない)
    --admin-capability と --collection-capability の両方
        → 指定した範囲だけができる

  --admin-capability:      schema:read / schema:write / settings:read / settings:write / all
  --collection-capability: <コレクション>[:read,create,update,delete] (繰り返し指定可。
                           動作を省くと4つ全部)

  例: 記事だけ書かせるトークン
    ohmycms token create --name writer --collection-capability articles:read,create,update
  例: スキーマ設計まで任せるトークン
    ohmycms token create --name architect --admin-capability schema:read,schema:write \
      --collection-capability articles:read,create,update,delete

  発行されたトークンは**この1回しか表示されない** (サーバは sha256 しか保存しない)。`,

  schema: `ohmycms schema — スキーマを書き出す

  ohmycms schema snapshot [--out <ファイル>] [--system]

  コレクション・フィールド・リレーションをまとめた JSON を吐く。
  --out を省くと標準出力に出す。`,

  user: `ohmycms user — ユーザーを見る

  ohmycms user list

  管理者権限が必要。403 になる場合は次の2つを確認する:
    ① 委任元ユーザーが管理者ポリシーを持っているか
    ② そのトークンの capabilities に settings:read があるか (CAPABILITY_DENIED のとき)`,

  whoami: `ohmycms whoami — いまの認証情報が誰なのかを表示する

  接続先・認証情報の出所・API が返した Actor を出す。トークンやセッションの値は出さない。
  エージェントなら capabilities の中身も出るので、「何ができるはずか」を確認できる。`,

  health: `ohmycms health — API に繋がるか確認する

  DB まで到達できていれば ok を返す。トークンは要らない。`,
};

export function printSubcommandHelp(command: string): boolean {
  const text = SUBCOMMAND_HELP[command];
  if (!text) return false;
  print(text);
  return true;
}
