"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import { Accordion } from "@/components/ui/accordion";
import { PanelFileDetail } from "@/components/admin/panel-file-detail";
import { PanelStorage } from "@/components/admin/panel-storage";
import { PanelSection } from "@/components/admin/panel-section";
import { sectionAnchorId } from "@/components/admin/page-sections";
import { PanelDisplay } from "@/components/admin/panel-display";
import { PanelApiMcp } from "@/components/admin/panel-api-mcp";
import { PanelLogs } from "@/components/admin/panel-logs";
import { useT } from "@/i18n/client";
import { pageMeta } from "@/lib/admin/page-meta";

/**
 * 右サイドバーの深さ1＝**そのページの説明**。
 *
 * 由来（堀池・2026-08-15 原文）。アコーディオンで5つ:
 *   ①そのページの概要 ②項目一覧 ③表示・切り替え ④API・MCP ⑤ログ・履歴
 *
 * 🚨 **いまは器と ①②まで。** ③④⑤ は**空の枠**で置いてある（中身は別担当）。
 *    枠を先に置くのは、後から足す人が「どこへ足すか」を探さなくて済むようにするため。
 *    ❌ 空だからといって枠ごと消さないこと（消すと5つの並びが崩れ、順番の合意が失われる）。
 *
 * 🚨 文言の出所は `lib/admin/page-meta.ts`（design が作った定義）ただ1つ。
 *    ここで説明文を書かない。書くと Storybook・LLM が読むものと画面が食い違う。
 */
/**
 * その id がページの中に実在するか。
 *
 * 🚨 **飛び先が無いリンクを描かない**（`page-actions.ts` の「壊れたリンクを描かない」と同じ考え方）。
 *    押しても何も起きないリンクは、**画面を見ているかぎり壊れていると分からない**。
 *    節がまだ用意されていないページでは、リンクではなく**ただの文字**として出す。
 *
 * 🚨 `useEffect` + `setState` にしない（React Compiler の lint が error にする）。
 *    返すのは文字列なので、同じ状態なら同じ値になり再描画も起きない。
 *    **守り手: `bun run lint`**。2026-08-15 に実測した——`useEffect(() => { setN(1); }, [])`
 *    を書いたファイルを置くと `exit 1` になり、**ファイル名と行が出る**
 *    （"Calling setState synchronously within an effect can trigger cascading renders"）。
 *    願望ではなく、壊すと落ちることを確かめてある。
 */
function useExistingAnchors(ids: readonly string[]): Set<string> {
  const key = useSyncExternalStore(
    () => () => {},
    () => ids.filter((id) => document.getElementById(id) !== null).join(","),
    () => "",
  );
  return new Set(key ? key.split(",") : []);
}

export function PageInfoPanel() {
  const t = useT("panel");
  // 名前空間を付けない。page-meta が名前空間つきの完全なキーを持っているため。
  const tKey = useT();
  const pathname = usePathname();
  const meta = pageMeta(pathname);

  const sections = meta?.sectionKeys ?? [];
  const anchors = useExistingAnchors(sections.map(sectionAnchorId));

  return (
    <Accordion defaultValue={["overview"]}>
      {/* ① 概要。🚨 説明が**無いページでは枠ごと出さない**。
          「準備中です」を出すと、説明が要らないページと、書き忘れたページの区別が付かない。 */}
      {meta?.descriptionKey ? (
        <PanelSection value="overview" title={t("overview")} contentClassName="text-muted-foreground">
          {tKey(meta.descriptionKey)}
          {/* 🚨 いまの保管先（D5）。`/admin/files` 以外では null を返すので、他のページには出ない。 */}
          <PanelStorage />
        </PanelSection>
      ) : null}

      {/* ② 項目一覧。ページの中の節へ飛ぶ。
          🚨 id の作り方は `page-sections.ts` に1つだけ置いてある。ここで組み立てない。 */}
      {/* 下線は消す。堀池（原文）:「意味がわからない＋デザインとしてノイズ」 */}
      {sections.length > 0 ? (
        <PanelSection value="sections" title={t("sections")}>
            <ul className="flex flex-col">
              {sections.map((key) => {
                const id = sectionAnchorId(key);
                const row = "flex min-h-(--control-h) items-center rounded-md px-2 text-sm text-muted-foreground md:min-h-(--control-h-pc)";
                // 🚨 `hover:` を書いたら必ず `active:` も書く（堀池 2026-08-15・全画面の規約）。
                //    タッチの端末には hover が無いので、hover だけだと
                //    **SP では押しても何も変わらない＝押した手応えが消える**。
                //    出典: https://zenn.dev/holykzm/articles/tailwind-tips-1
                return (
                  <li key={key}>
                    {anchors.has(id) ? (
                      <a
                        href={`#${id}`}
                        className={`${row} hover:bg-muted hover:text-foreground active:bg-muted active:text-foreground`}
                      >
                        {tKey(key)}
                      </a>
                    ) : (
                      // 飛び先がまだ無い節。名前は出すが、押せるようには見せない。
                      <span className={row}>{tKey(key)}</span>
                    )}
                  </li>
                );
              })}
            </ul>
        </PanelSection>
      ) : null}

      {/* ファイルの詳細（B6）。🚨 選んでいるときだけ出る（選択が 0 なら null を返す）。
          値は lib/admin/files-selection.ts（L4 の持ち物）から読むだけ。 */}
      <PanelFileDetail />

      {/* ③ 表示・切り替え。中身は `components/admin/panel-display.tsx`。
          🚨 **一覧ページ以外では `null` を返す**ので、ここに枠は残らない（①概要と同じ規律）。 */}
      <PanelDisplay />

      {/* ④ API・MCP。中身は `components/admin/panel-api-mcp.tsx`。
          🚨 原典の「**OpenAPI から抽出できるならそうする**」は、**抽出元がこのリポジトリに無い**
             （実測・囮つきで確認）ため形式では満たせない。原文の理由「DRY・マスタは1つ」を守り、
             MCP の目録（`packages/mcp/src/catalog.ts`）を唯一の正にしてある。詳細は同ファイルの冒頭。 */}
      <PanelApiMcp />

      {/* ⑤ ログ・履歴。中身は `components/admin/panel-logs.tsx`。
          🚨 権限が無い / 一覧・詳細ページ以外では `null` を返すので、ここに枠は残らない。 */}
      <PanelLogs />
    </Accordion>
  );
}
