"use client";

import { useState } from "react";
import { Lock, Tag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { labelDisplayName } from "@/components/admin/label-display-name";
import { useT } from "@/i18n/client";

export type LabelRow = {
  id: string;
  name: string;
  color: string | null;
  is_system: boolean;
  /** 種まきしたシステムラベルの識別子。利用者が作ったものは null */
  system_key: string | null;
};

/**
 * 🚨 **これは注意書きであって、守りではありません**（2026-08-15 実測）。
 *    組み立てた形（`` `text-${"slate"}-500` ``）に書き換えても
 *    **`check-undefined-classes` も `tsc` も通ります**。**気づける仕組みはありません。**
 *    守るのは**書く人の目**だけなので、レビューで見てください。
 *
 * 🚨 **`text-${color}-500` のように組み立てない。** Tailwind は**書かれた文字列を見て**
 *    CSS を作るので、組み立てた名前は削られて色が出ない（ビルドするまで分からない）。
 *    `folder-grid.tsx` と同じ並びにしてある（フォルダの色とラベルの色が食い違うと、
 *    利用者から見て「同じ色の名前なのに違う色」になる）。
 */
const COLOR_CLASS: Record<string, string> = {
  slate: "text-slate-500",
  red: "text-red-500",
  amber: "text-amber-500",
  emerald: "text-emerald-500",
  sky: "text-sky-500",
  violet: "text-violet-500",
};

/**
 * ラベルの管理（作る・名前と色を変える・消す）。
 *
 * 🚨 **付ける画面とは別物**。付けるのはファイル・フォルダ側（`file-labels-editor` /
 *    `folder-labels-menu`）で、ここは**選択肢そのもの**を作る場所。
 *    原典 L73 が「ファイルのアコーディオンの中に『ストレージ』『ラベル』」と言っているのがここ。
 *
 * 🚨 **システムラベルは消せないが、名前と色は変えられる**（API もそう作ってある）。
 *    仕組み側は `system_key` で引いていて**名前では引いていない**ので、
 *    名前を変えても取り込みの印付けは壊れない。
 */
export function LabelsManager({ initial }: { initial: LabelRow[] }) {
  const t = useT("labels");
  /**
   * 🚨 **これも注意書きであって、守りではありません**（2026-08-15 実測）。
   *    組み立てた形に書き換えても **`check-i18n-usage` も `check-i18n-keys` も通ります**。
   *    **辞書から消しても誰も気づきません**（＝画面にキー名がそのまま出る）。
   *
   * 🚨 **辞書のキーも組み立てない**（`t(\`color_${name}\`)` にしない）。
   *    上の Tailwind と**まったく同じ理由**で、`check-i18n-usage` は
   *    **書かれた文字列を見て**コードと辞書を突き合わせるため、
   *    組み立てたキーは**追えない**。ja と en の両方から消しても誰も気づかず、
   *    画面にキー名がそのまま出る（2026-08-15 に実測して確認した）。
   */
  const colorOptions = [
    { value: "", label: t("color_none") },
    { value: "slate", label: t("color_slate") },
    { value: "red", label: t("color_red") },
    { value: "amber", label: t("color_amber") },
    { value: "emerald", label: t("color_emerald") },
    { value: "sky", label: t("color_sky") },
    { value: "violet", label: t("color_violet") },
  ];
  const [labels, setLabels] = useState<LabelRow[]>(initial);
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  /** 名前を変えている最中のラベル。編集していないときは null */
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  /**
   * 🚨 **状態コードでなく `code` で分ける。**
   *    `delete` の **403 は2つの原因を持つ**——`PERMISSION_DENIED`（権限が無い）と
   *    `LABEL_IS_SYSTEM`（システムラベルなので消せない）。
   *    403 だけを見て「このラベルは削除できません」と出すと、
   *    **権限が無いだけの人に「そのラベルは消せない性質だ」と言う**ことになる
   *    （＝実際より強いことを言う文言。2026-08-15 に実際に書いていた）。
   *
   * 🚨 **サーバの `message` をそのまま画面へ出さない。** `lib/` の文言は日本語のリテラルで、
   *    辞書を通っていない（英語に切り替えても日本語のまま出る）。**こちらでキーへ写す。**
   */
  const messageFor = async (response: Response, fallback: string): Promise<string> => {
    const body = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
    switch (body?.error?.code) {
      case "PERMISSION_DENIED":
        return t("error_forbidden");
      case "LABEL_IS_SYSTEM":
        return t("error_system_label");
      case "LABEL_EXISTS":
        return t("error_duplicate");
      case "LABEL_NOT_FOUND":
        return t("error_not_found");
      case "INVALID_FIELD":
        return t("error_invalid");
      default:
        break;
    }
    // code が無い/未知のときは状態コードで最低限だけ分ける。
    // 🚨 **分からないものを分かったように言わない**。既定は「できませんでした」に留める。
    //
    // この API が返しうる code のうち、上で分岐していないのは次の5つ（2026-08-15 実測）:
    //   INVALID_SESSION / UNAUTHENTICATED  … **401**。下の1行が拾う
    //   INVALID_BEARER_TOKEN / INVALID_AGENT_TOKEN / HUMAN_AUTH_REQUIRED
    //     … トークンで来た呼び出し向け。**この画面（ブラウザのセッション）からは出ない**
    // 🚨 とくに `HUMAN_AUTH_REQUIRED` は **403 だが権限の話ではない**。
    //    403 をまとめて「権限がありません」にすると**嘘になる**ので、既定へ落としている。
    //    （`delete` の 403 が `PERMISSION_DENIED` と `LABEL_IS_SYSTEM` の2つを持つのと同じ形。
    //     **状態コードで分けると必ずどこかで嘘になる**）
    if (response.status === 401) return t("error_unauthenticated");
    return fallback;
  };

  /** 消えていた行を一覧からも外す（残すと、押しても直らないものを押し続けることになる）。 */
  const dropIfGone = async (response: Response, id: string) => {
    const body = (await response.clone().json().catch(() => null)) as { error?: { code?: string } } | null;
    if (body?.error?.code === "LABEL_NOT_FOUND") {
      setLabels((current) => current.filter((row) => row.id !== id));
      setEditing(null);
    }
  };

  /**
   * 🚨 `useSubmitOnce` は `try`/`finally` だけで **`catch` を持たない**。
   *    回線が切れて `fetch` が投げると、**画面には何も出ない**（押しても無反応に見える）。
   *    ここで受け止めて「通信できませんでした」を出す。
   *    🚨 これは「サーバが拒否した」ではないので、**保存失敗と同じ文言にしない**。
   */
  const send = async (input: RequestInfo, init?: RequestInit): Promise<Response | null> => {
    try {
      return await fetch(input, init);
    } catch {
      toast.error(t("error_network"));
      return null;
    }
  };

  const create = useSubmitOnce(async () => {
    const response = await send("/api/labels", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, color: color === "" ? null : color }),
    });
    if (!response) return;
    if (!response.ok) {
      toast.error(await messageFor(response, t("save_failed")));
      return;
    }
    const payload = (await response.json()) as { data: LabelRow };
    // システムラベルを先頭に、その中は名前順（API の並びに合わせる）
    setLabels((current) =>
      [...current, payload.data].sort(
        (a, b) => Number(b.is_system) - Number(a.is_system) || a.name.localeCompare(b.name),
      ),
    );
    setName("");
    setColor("");
    toast.success(t("created"));
  });

  const patch = useSubmitOnce(async (id: string, body: Record<string, unknown>) => {
    const response = await send(`/api/labels/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response) return;
    if (!response.ok) {
      await dropIfGone(response, id);
      toast.error(await messageFor(response, t("save_failed")));
      return;
    }
    const payload = (await response.json()) as { data: LabelRow };
    setLabels((current) => current.map((label) => (label.id === id ? payload.data : label)));
    setEditing(null);
    toast.success(t("saved"));
  });

  const remove = useSubmitOnce(async (label: LabelRow) => {
    // 🚨 消すと、付いているファイル・フォルダからも外れる。取り返せないので必ず尋ねる。
    if (!window.confirm(t("delete_confirm", { name: labelDisplayName(t, label) }))) return;
    const response = await send(`/api/labels/${label.id}`, { method: "DELETE" });
    if (!response) return;
    if (!response.ok) {
      await dropIfGone(response, label.id);
      toast.error(await messageFor(response, t("delete_failed")));
      return;
    }
    setLabels((current) => current.filter((row) => row.id !== label.id));
    toast.success(t("deleted"));
  });

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-medium">{t("list_heading")}</h2>
        {labels.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="divide-y">
            {labels.map((label) => (
              <li key={label.id} className="flex items-center gap-3 py-2">
                <Tag
                  className={`size-4 shrink-0 ${label.color ? (COLOR_CLASS[label.color] ?? "") : "text-muted-foreground"}`}
                />
                {editing?.id === label.id ? (
                  <>
                    <Input
                      value={editing.name}
                      aria-label={t("name_label")}
                      onChange={(event) => setEditing({ id: label.id, name: event.target.value })}
                      className="h-8 max-w-64"
                    />
                    <Button
                      size="sm"
                      disabled={patch.pending || editing.name.trim() === ""}
                      onClick={() => void patch.run(label.id, { name: editing.name })}
                    >
                      {t("save")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      {t("cancel")}
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm">{labelDisplayName(t, label)}</span>
                    {label.is_system ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Lock className="size-3" />
                        {t("system_badge")}
                      </span>
                    ) : null}
                    {/* 色は選び直せる。選んだ瞬間に保存する（保存ボタンを増やさない） */}
                    <select
                      aria-label={t("color_label")}
                      value={label.color ?? ""}
                      disabled={patch.pending}
                      onChange={(event) =>
                        void patch.run(label.id, {
                          color: event.target.value === "" ? null : event.target.value,
                        })
                      }
                      className="h-(--control-h) rounded-lg bg-muted/60 px-2 text-base md:h-(--control-h-pc-field) md:text-sm"
                    >
                      {colorOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {/* 🚨 システムラベルの名前は**辞書から出している**（英語では英語で出る）。
                        変えられるようにすると、**変えた名前が画面に出ない**——
                        辞書の側が勝つので、直したつもりが反映されない形になる。
                        色は変えられる（表示に辞書は関係しないため）。 */}
                    {label.is_system ? null : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing({ id: label.id, name: label.name })}
                      >
                        {t("rename")}
                      </Button>
                    )}
                    {/* 🚨 システムラベルには削除を**出さない**。押せて 403 が返るより、
                        最初から無い方が分かる（消せないことは上の錠前で伝えている） */}
                    {label.is_system ? null : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={remove.pending}
                        onClick={() => void remove.run(label)}
                      >
                        {t("delete")}
                      </Button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">{t("system_hint")}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">{t("create_heading")}</h2>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void create.run();
          }}
        >
          <div className="space-y-1">
            <label htmlFor="label-name" className="block text-xs text-muted-foreground">
              {t("name_label")}
            </label>
            {/* 名前は短いものしか入らない。横幅を欲張らない（原典 L94） */}
            <Input
              id="label-name"
              value={name}
              maxLength={100}
              placeholder={t("name_placeholder")}
              onChange={(event) => setName(event.target.value)}
              className="w-64"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="label-color" className="block text-xs text-muted-foreground">
              {t("color_label")}
            </label>
            <select
              id="label-color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              className="h-(--control-h) rounded-lg bg-muted/60 px-2 text-base md:h-(--control-h-pc-field) md:text-sm"
            >
              {colorOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={create.pending || name.trim() === ""}>
            {create.pending ? t("creating") : t("create_submit")}
          </Button>
        </form>
      </section>
    </div>
  );
}
