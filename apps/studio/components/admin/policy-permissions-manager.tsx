"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2 } from "lucide-react";
import type { CollectionResult } from "@/lib/schema/models";
import { ListEmpty } from "@/components/admin/list-empty";
import { PermissionCell, cellStateOf, type CellState } from "@/components/admin/permission-grid";
import { WideTable } from "@/components/admin/wide-table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { useFormSubmitShortcut } from "@/hooks/use-form-submit-shortcut";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useT } from "@/i18n/client";
import { errorKeyFromApiCode, FALLBACK_ERROR_KEY, type ErrorKey } from "@/i18n/error";

type PermissionRow = {
  id: number;
  policy: string;
  collection: string;
  action: "read" | "create" | "update" | "delete";
  permissions: unknown;
  fields: string | null;
};

type Props = {
  policyId: string;
  collections: CollectionResult[];
  permissions: PermissionRow[];
};

const actions = ["read", "create", "update", "delete"] as const;

/**
 * 🚨 **API の生文言を画面へ出さない。** code だけを見て辞書の鍵へ写す。
 *    生文言は `lib/` に直書きされた日本語なので、**英語で見ている人の画面にも日本語が出る**。
 *    表に無い code は `null` を返し、呼び出し側の具体的な文言を使う
 *    （`unexpected`「予期しないエラー」より、その場の文言のほうが正確なため）。
 */
function errorKeyFrom(payload: unknown): ErrorKey | null {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "code" in payload.error &&
    typeof payload.error.code === "string"
  ) {
    const key = errorKeyFromApiCode(payload.error.code);
    return key === FALLBACK_ERROR_KEY ? null : key;
  }
  return null;
}

function jsonText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return JSON.stringify(value, null, 2);
}

function parseJsonOrNull(text: string): { ok: true; value: unknown } | { ok: false } {
  if (text.trim() === "") return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function fieldsFor(collections: CollectionResult[], collection: string): string[] {
  return collections.find((item) => item.collection === collection)?.schema?.columns.map((column) => column.name) ?? [];
}

/**
 * 権限フィルタの JSON。**行ごとに1つ**あるので、部品に切り出して**行ごとに targetId を持たせる**。
 *
 * 🚨 map の中で1つの targetId を使い回すと、**コピー先が最後に描かれた1つへ偏る**。
 * 行ごとに別 ID を渡して、押した行の値を選択・コピーできるようにする。
 * （実際にこの形で書いてしまい、書いた直後に気づいた）
 *
 * 🚨 マスクはスクロールする <pre> そのものに当てる。外側に巻くと監査が赤のままになる。
 */
function FilterBlock({ value, targetId }: { value: string; targetId: string }) {
  return <CodeBlock value={value} targetId={targetId} />;
}

export function PolicyPermissionsManager({ policyId, collections, permissions }: Props) {
  const router = useRouter();
  const t = useT("policies");
  const tError = useT("errors");
  // 🚨 呼び出し側は変えない。中で code → 辞書の鍵に写すだけ。
  const messageFrom = (payload: unknown, fallback: string) => {
    const key = errorKeyFrom(payload);
    return key ? tError(key) : fallback;
  };
  const [collection, setCollection] = useState(collections[0]?.collection ?? "");
  const [action, setAction] = useState<(typeof actions)[number]>("read");
  const [allFields, setAllFields] = useState(true);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [filterJson, setFilterJson] = useState("");
  const [editing, setEditing] = useState<PermissionRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  /** ポップアップで開いているマス。`null` なら閉じている。 */
  const [openName, setOpenName] = useState<string | null>(null);
  const [openAction, setOpenAction] = useState<(typeof actions)[number] | null>(null);
  const columns = useMemo(() => fieldsFor(collections, collection), [collections, collection]);
  const saveDisabled = !collection;

  /**
   * 格子の索引。`コレクション\u0000操作` → 権限の行。
   * 🚨 **1 回だけ組む**。マスごとに `permissions.find(...)` を回すと 15×4 = 60 回走る。
   */
  const byCell = useMemo(() => {
    const map = new Map<string, PermissionRow>();
    for (const row of permissions) map.set(`${row.collection}\u0000${row.action}`, row);
    return map;
  }, [permissions]);
  const cellRow = (name: string, act: (typeof actions)[number]) => byCell.get(`${name}\u0000${act}`);
  const stateLabelOf = (state: CellState) =>
    state === "all" ? t("cell_all") : state === "conditional" ? t("cell_conditional") : t("cell_none");
  const actionLabelOf = (act: (typeof actions)[number]) =>
    act === "read" ? t("action_read") : act === "create" ? t("action_create") : act === "update" ? t("action_update") : t("action_delete");

  /** 行の一括の確認待ち。`null` なら確認していない。 */
  const [bulk2, setBulk2] = useState<{ collection: string; mode: "all" | "none" } | null>(null);

  /**
   * 行（コレクション）の 4 マスをまとめて変える。
   *
   * 🚨 **`all` は「なし」のマスだけ足す**（既に在る行は触らない）。
   *   触ると **書いた行フィルタを黙って上書きする**ことになる——
   *   条件つきを含む行では、**先に確認を出してから**ここへ来る（`bulk2`）。
   * 🚨 **`none` は行を消す**。**物理削除**なので、条件つきを含むなら確認が要る。
   * 🚨 **1 本でも失敗したら、そこで止めて出す**（**残りを黙って続けない**）。
   */
  const bulk = useSubmitOnce(async (name: string, mode: "all" | "none") => {
    setError(null);
    for (const act of actions) {
      const row = cellRow(name, act);
      if (mode === "all") {
        if (row) continue;
        const response = await fetch("/api/permissions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ policy: policyId, collection: name, action: act, permissions: null, fields: "*" }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          setError(messageFrom(payload, t("error_save_failed")));
          return;
        }
      } else {
        if (!row) continue;
        const response = await fetch(`/api/permissions/${row.id}`, { method: "DELETE" });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          setError(messageFrom(payload, t("error_delete_failed")));
          return;
        }
      }
    }
    router.refresh();
  }, (name, mode) => `${name}:${mode}`);
  const applyBulk = (name: string, mode: "all" | "none") => bulk.run(name, mode);

  /** そのマスを開く（**新規でも編集でも、同じポップアップ**）。 */
  function openCell(name: string, act: (typeof actions)[number]) {
    const row = cellRow(name, act);
    setError(null);
    setCollection(name);
    setAction(act);
    if (row) {
      const parsedFields = (row.fields ?? "").split(",").map((field) => field.trim()).filter(Boolean);
      setEditing(row);
      setAllFields(parsedFields.includes("*") || parsedFields.length === 0);
      setSelectedFields(parsedFields.includes("*") ? [] : parsedFields);
      setFilterJson(jsonText(row.permissions));
    } else {
      setEditing(null);
      setAllFields(true);
      setSelectedFields([]);
      setFilterJson("");
    }
    setOpenName(name);
    setOpenAction(act);
  }

  function resetForm() {
    setEditing(null);
    setAction("read");
    setAllFields(true);
    setSelectedFields([]);
    setFilterJson("");
  }


  const save = useSubmitOnce(async () => {
    setError(null);
    const parsed = parseJsonOrNull(filterJson);
    if (!parsed.ok) {
      setError(t("invalid_filter_json"));
      return;
    }
    const body = {
      policy: policyId,
      collection,
      action,
      permissions: parsed.value,
      fields: allFields ? "*" : selectedFields.join(","),
    };
    const response = await fetch(editing ? `/api/permissions/${editing.id}` : "/api/permissions", {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(messageFrom(payload, response.status === 403 ? t("error_forbidden") : t("error_save_failed")));
      return;
    }
    resetForm();
    router.refresh();
  });

  const remove = useSubmitOnce(async (id: number) => {
    setError(null);
    const response = await fetch(`/api/permissions/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(messageFrom(payload, response.status === 403 ? t("error_forbidden") : t("error_delete_failed")));
      return;
    }
    toast.success(t("permission_deleted"));
    router.refresh();
  }, (id) => String(id));

  useFormSubmitShortcut("policy-permission-form", { pending: save.pending, disabled: saveDisabled });

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {/* 🚨 **これはこのポリシーだけの設定**。利用者に実際に効くのは、
          その人に紐づく**全ポリシーを合わせたもの**（`filter_json_help_combination` のとおり）。
          🚨 **1 つの格子を見て「この人はこう見える」と読むと外れます。**
          合成結果を出す画面を作るかは、堀池さん判断として板に出ている（2026-08-17）。 */}
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>{t("grid_scope_note")}</p>
        {/* 🚨 **いま効く範囲を必ず添える**（security・2026-08-17）。
            **管理画面は `admin_access` で二値**なので、ここを絞っても
            「管理画面に入る非 admin 利用者の見える範囲」は今日は変わらない。
            書かないと、堀池さんが**いま見えている画面の話**として読む。 */}
        <p>{t("grid_scope_where")}</p>
      </div>
      {/* 🚨 コレクション × 操作 の**格子**。堀池指示「権限の設定変更などどんなふうに ui を作っているか」。
          それまでは**平らな一覧**で、「このコレクションの read は許可されているか」を
          **行を目で探して**確かめる形だった（＝ 見えていない組み合わせが分からない）。
          🚨 **行が増えたときの手当ては入れていない**（いま 15 本）。
             100 本を超えたら**絞り込み**が要る。**入れていないことをここに書いておく**。 */}
      {collections.length === 0 ? (
        // 🚨 **空のときに「無い」で終わらせない**（DESIGN.md §1-10）。
        //    この画面は同じ規約を見た他の 4 本と違い、**空のとき本文の操作が 1 つも無い**:
        //    下にある `<form>` は**格子のマスから開くダイアログの中**なので、
        //    コレクションが 0 件だと格子ごと出ず、**開く道が無い**（実測: form の直前 40 行に <Dialog> 4）。
        //    ＝ ここでできることは「権限を付ける」ではなく「先にコレクションを作る」。
        // 🚨 形は**既に §1-10 を満たしていた 1 本**（app/(admin)/admin/content/page.tsx）に合わせた。
        //    新しい並べ方を発明しない（15 本が各自の形を作ると、空の画面だけ画面ごとに違う顔になる）。
        // 🚨 権限で出し分けていないのは、**管理画面が二値**だから
        //    （`knowledge/decisions/admin-ui-is-all-or-nothing.md`）。
        //    ここが見えている人は管理者で、コレクションを作れる。
        <div className="flex flex-col items-start gap-4">
          <ListEmpty>{t("no_collections")}</ListEmpty>
          <Link href="/admin/collections/new" className={buttonVariants()}>
            <Plus data-icon="inline-start" />
            {t("no_collections_action")}
          </Link>
        </div>
      ) : (
        <WideTable>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("collection_label")}</TableHead>
                {actions.map((act) => (
                  <TableHead key={act} className="w-28">{actionLabelOf(act)}</TableHead>
                ))}
                <TableHead className="w-40 text-right">
                  <span className="sr-only">{t("row_options")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {collections.map((item) => {
                const states = actions.map((act) => cellStateOf(cellRow(item.collection, act)));
                const hasConditional = states.includes("conditional");
                const allOn = states.every((s) => s !== "none");
                const allOff = states.every((s) => s === "none");
                return (
                  <TableRow key={item.collection}>
                    <TableCell className="font-medium">{item.collection}</TableCell>
                    {actions.map((act, index) => (
                      <TableCell key={act}>
                        <PermissionCell
                          state={states[index]}
                          label={`${item.collection} / ${actionLabelOf(act)}`}
                          stateLabel={stateLabelOf(states[index])}
                          onOpen={() => openCell(item.collection, act)}
                        />
                      </TableCell>
                    ))}
                    <TableCell className="text-right">
                      {/* 🚨 行の一括。**条件つきが 1 つでも在れば確認する**——
                          どちらの向きでも**書いた行フィルタが消える**ため
                          （`confirm-by-reversibility-and-reach` §2.5）。 */}
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={allOn || bulk.pending}
                          onClick={() => (hasConditional ? setBulk2({ collection: item.collection, mode: "all" }) : void applyBulk(item.collection, "all"))}
                        >
                          {t("row_all_button")}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={allOff || bulk.pending}
                          onClick={() => (hasConditional ? setBulk2({ collection: item.collection, mode: "none" }) : void applyBulk(item.collection, "none"))}
                        >
                          {t("row_none_button")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </WideTable>
      )}
      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("permission_delete_confirm_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("permission_delete_confirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          {/* 🚨 **消えるものを見せる**（決定 §4「本文に及ぶ範囲を書く」）。
              **物理削除**なので、ここに出ている行フィルタは**この後どこにも残りません**。 */}
          {confirming !== null
            ? (() => {
                const row = permissions.find((one) => one.id === confirming);
                if (!row) return null;
                const json = jsonText(row.permissions);
                const fieldList = (row.fields ?? "").trim();
                const hasFieldLimit = fieldList !== "" && fieldList !== "*";
                // 🚨 **失う 2 軸を両方出す**（security・2026-08-17）。
                //    行を物理削除すると **行フィルタ JSON と 欄の指定が同時に消える**。
                //    🚨 片方だけ見せると、**隠していた欄を晒すことに管理者が気づけない**。
                if (!json && !hasFieldLimit) return null;
                return (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">{t("permission_delete_lost")}</p>
                    {json ? <FilterBlock value={json} targetId={`policy-filter-lost-${confirming}`} /> : null}
                    {hasFieldLimit ? (
                      <p className="text-xs">
                        <span className="text-muted-foreground">{t("permission_delete_lost_fields")}</span>{" "}
                        <span className="font-mono">{fieldList}</span>
                      </p>
                    ) : null}
                  </div>
                );
              })()
            : null}
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction
              tone="danger"
              loading={confirming !== null && remove.isPending(String(confirming))}
              onClick={() => {
                if (confirming === null) return;
                void remove.run(confirming);
                setConfirming(null);
              }}
            >
              {t("permission_delete_confirm_action")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* 🚨 行の一括の確認。**条件つきが 1 つでも在るときだけ**出る。
          どちらの向き（All / None）でも、**書いた行フィルタが消える**ため
          （All は「なし」だけ足すが、**利用者は「全部許可」と読む**——
           条件つきが残ることを、ここで先に伝える）。 */}
      <AlertDialog open={bulk2 !== null} onOpenChange={(open) => !open && setBulk2(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulk2?.mode === "none" ? t("row_none_confirm_title") : t("row_all_confirm_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulk2?.mode === "none" ? t("row_none_confirm") : t("row_all_confirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* 🚨 **件数だけでなく中身を列挙する**（security・2026-08-17）。
              一括の「全部なし」は**複数行を一度に物理削除しうる**ので、
              **何が消えるのかを 1 つずつ見せる**。 */}
          {bulk2?.mode === "none"
            ? (() => {
                const lost = actions
                  .map((act) => ({ act, row: cellRow(bulk2.collection, act) }))
                  .filter((one) => one.row && cellStateOf(one.row) === "conditional");
                if (lost.length === 0) return null;
                return (
                  <ul className="space-y-2 text-xs">
                    {lost.map(({ act, row }) => {
                      const json = jsonText(row?.permissions);
                      const fieldList = (row?.fields ?? "").trim();
                      const hasFieldLimit = fieldList !== "" && fieldList !== "*";
                      return (
                        <li key={act} className="space-y-1">
                          <span className="font-medium">{actionLabelOf(act)}</span>
                          {json ? <FilterBlock value={json} targetId={`policy-bulk-lost-${bulk2.collection}-${act}`} /> : null}
                          {hasFieldLimit ? (
                            <p>
                              <span className="text-muted-foreground">{t("permission_delete_lost_fields")}</span>{" "}
                              <span className="font-mono">{fieldList}</span>
                            </p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                );
              })()
            : null}
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction
              tone={bulk2?.mode === "none" ? "danger" : "default"}
              loading={bulk2 !== null && bulk.isPending(`${bulk2.collection}:${bulk2.mode}`)}
              onClick={() => {
                if (!bulk2) return;
                void applyBulk(bulk2.collection, bulk2.mode);
                setBulk2(null);
              }}
            >
              {bulk2?.mode === "none" ? t("row_none_button") : t("row_all_button")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* 🚨 ポップアップの中身は**いまのフォームのまま**。
          **条件ビルダーは堀池さん待ち**なので、生 JSON の textarea を変えない
          （**形を変えないほうが、答えが来たとき差し替えやすい**）。 */}
      <Dialog
        open={openName !== null}
        onOpenChange={(next) => {
          if (!next) {
            setOpenName(null);
            setOpenAction(null);
            resetForm();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {openName && openAction ? `${openName} / ${actionLabelOf(openAction)}` : ""}
            </DialogTitle>
          </DialogHeader>
      <form
        id="policy-permission-form"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save.run();
        }}
      >
        {/* 🚨 コレクションと操作は**マスが決めている**ので、ここでは選ばせない。
            選べるようにすると、**開いたマスと違うものを保存できてしまう**（格子と食い違う）。 */}
        <div className="space-y-2">
          <Label>{t("fields_list_label")}</Label>
          <label className="flex min-h-(--control-h) items-center gap-2 text-sm md:min-h-(--control-h-pc)">
            <input type="checkbox" checked={allFields} onChange={(event) => setAllFields(event.target.checked)} className="size-4" />
            {t("allow_all_label")}
          </label>
          {!allFields ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {columns.map((field) => (
                <label key={field} className="flex min-h-(--control-h) items-center gap-2 text-sm md:min-h-(--control-h-pc)">
                  <input
                    type="checkbox"
                    checked={selectedFields.includes(field)}
                    onChange={(event) => {
                      setSelectedFields((current) =>
                        event.target.checked
                          ? [...current, field]
                          : current.filter((item) => item !== field),
                      );
                    }}
                    className="size-4"
                  />
                  {field}
                </label>
              ))}
            </div>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="permissions">{t("filter_json_label")}</Label>
          <Textarea
            id="permissions"
            value={filterJson}
            onChange={(event) => setFilterJson(event.target.value)}
            className="min-h-36 font-mono md:max-w-2xl"
            placeholder='{"owner":{"_eq":"$CURRENT_USER"}}'
          />
          <p className="text-xs leading-5 text-muted-foreground">{t("filter_json_help_variables")}</p>
          <p className="text-xs leading-5 text-muted-foreground">{t("filter_json_help_combination")}</p>
        </div>
        <div className="flex gap-2">
          <Button type="submit" loading={save.pending} disabled={saveDisabled}>
            <Save />
            {editing ? t("update_button") : t("add_button")}
          </Button>
        </div>
      </form>
          {/* 🚨 削除はここだけ（**格子のマスからは消えない**）。
              🚨 **条件つきなら確認する**——書いた行フィルタと欄の指定が消えるため。
              **すべて（条件が無い）なら確認しない**（消える情報が無い）。 */}
          {editing ? (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="destructive-ghost"
                size="sm"
                loading={remove.isPending(String(editing.id))}
                onClick={() => {
                  if (cellStateOf(editing) === "conditional") {
                    setConfirming(editing.id);
                    return;
                  }
                  void remove.run(editing.id);
                  setOpenName(null);
                  setOpenAction(null);
                  resetForm();
                }}
              >
                <Trash2 />
                {t("delete_button")}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
