"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { sectionAnchorId } from "@/components/admin/page-sections";
import { PanelDisplay } from "@/components/admin/panel-display";
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
        <AccordionItem value="overview">
          <AccordionTrigger>{t("overview")}</AccordionTrigger>
          <AccordionContent className="text-muted-foreground">
            {tKey(meta.descriptionKey)}
          </AccordionContent>
        </AccordionItem>
      ) : null}

      {/* ② 項目一覧。ページの中の節へ飛ぶ。
          🚨 id の作り方は `page-sections.ts` に1つだけ置いてある。ここで組み立てない。 */}
      {sections.length > 0 ? (
        <AccordionItem value="sections">
          <AccordionTrigger>{t("sections")}</AccordionTrigger>
          {/* 下線は消す。堀池（原文）:「意味がわからない＋デザインとしてノイズ」 */}
          <AccordionContent>
            <ul className="flex flex-col">
              {sections.map((key) => {
                const id = sectionAnchorId(key);
                const row = "flex min-h-(--control-h) items-center rounded-md px-2 text-sm text-muted-foreground md:min-h-(--control-h-pc)";
                return (
                  <li key={key}>
                    {anchors.has(id) ? (
                      <a href={`#${id}`} className={`${row} hover:bg-muted hover:text-foreground`}>
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
          </AccordionContent>
        </AccordionItem>
      ) : null}

      {/* ③ 表示・切り替え。中身は `components/admin/panel-display.tsx`。
          🚨 **一覧ページ以外では `null` を返す**ので、ここに枠は残らない（①概要と同じ規律）。 */}
      <PanelDisplay />

      {/* ④ API・MCP。
          TODO: 原典は「**OpenAPI から抽出できるならそうする**」＝ここに手で書かない。
          MCP でこのページや選択中の ID を LLM へ渡すプロンプトを**コピーできる**ようにする。 */}
      <AccordionItem value="api">
        <AccordionTrigger>{t("api_mcp")}</AccordionTrigger>
        <AccordionContent className="text-muted-foreground">{t("todo")}</AccordionContent>
      </AccordionItem>

      {/* ⑤ ログ・履歴。
          TODO: 権限の「ログ・履歴」に対応する。全記事をバージョン管理し、前の版の確認と上書き。 */}
      <AccordionItem value="history">
        <AccordionTrigger>{t("history")}</AccordionTrigger>
        <AccordionContent className="text-muted-foreground">{t("todo")}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
