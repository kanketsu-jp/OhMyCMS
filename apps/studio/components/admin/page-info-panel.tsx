"use client";

import { usePathname } from "next/navigation";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { sectionAnchorId } from "@/components/admin/page-sections";
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
export function PageInfoPanel() {
  const t = useT("panel");
  // 名前空間を付けない。page-meta が名前空間つきの完全なキーを持っているため。
  const tKey = useT();
  const pathname = usePathname();
  const meta = pageMeta(pathname);

  const sections = meta?.sectionKeys ?? [];

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
          <AccordionContent className="[&_a]:no-underline">
            <ul className="flex flex-col">
              {sections.map((key) => (
                <li key={key}>
                  <a
                    href={`#${sectionAnchorId(key)}`}
                    className="flex min-h-(--control-h) items-center rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground md:min-h-(--control-h-pc)"
                  >
                    {tKey(key)}
                  </a>
                </li>
              ))}
            </ul>
          </AccordionContent>
        </AccordionItem>
      ) : null}

      {/* ③ 表示・切り替え（列の数・データテーブル/カレンダー/カンバン）。
          TODO: 中身は別担当。Directus を参考にする、と原典にある。 */}
      <AccordionItem value="display">
        <AccordionTrigger>{t("display")}</AccordionTrigger>
        <AccordionContent className="text-muted-foreground">{t("todo")}</AccordionContent>
      </AccordionItem>

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
