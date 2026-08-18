"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ArrowLeftIcon, InfoIcon, XIcon } from "lucide-react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { PageInfoPanel } from "@/components/admin/page-info-panel";
import { usePageTrail } from "@/components/admin/page-trail";
import { SHORTCUTS, formatShortcut } from "@/components/admin/shortcuts";
import { useIsMac, useShortcut } from "@/components/admin/use-shortcut";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/i18n/client";

/**
 * 右サイドバー。**中身が差し替わる**（1枚のパネルではなく、積み重ね）。
 *
 * 由来（堀池・2026-08-15 原文）:
 * > 「（info を押すと）右サイドバーが表示され、（これは左サイドバーと同じイメージでおおきく、
 * >   **左サイドバー｜コンテンツ｜右サイドバー**になる）」
 * > 「PCの場合は右サイドバーに表示させます。よって、**右サイドバーは内容が切り替わる設計が必要**。
 * >   ただし報告した後は**戻るボタンで一つ前の表示に戻る**。このように右サイドバーは他の要素が介入する。」
 *
 * → だから「開いている / 閉じている」ではなく **積み重ね（stack）** で持つ。
 *   深さ1 ＝ そのページの説明（概要・項目一覧…）。押し込むと不具合報告などがその上に載る。
 *
 * 🚨 **PC と SP の出し分けはこの部品が引き受ける。** 使う側は `push()` を1回呼ぶだけで、
 *    PC では右サイドバーに積まれ、SP では全画面のダイアログが開く。
 *    使う側に `md:` の分岐を書かせると、**ページごとに挙動が割れる**。
 *
 * 🚨 **CSS で出し分けない**（`hidden md:flex` の二重描画にしない）。
 *    両方描くと中のフォームが2つ生まれ、id も state も重複する。
 *    どちらか一方だけを描くために、実際の画面幅を見る。
 */

export type PanelEntry = {
  /** 同じものを二重に積まないための印 */
  key: string;
  /** 見出しに使う**名前空間つきの完全な辞書キー**（例: "reports.create_title"）。文言そのものを渡さない */
  titleKey: string;
  node: ReactNode;
};

type RightPanelApi = {
  isOpen: boolean;
  /** 1 = 既定の「このページの説明」。2 以上は押し込まれたもの */
  depth: number;
  open: () => void;
  close: () => void;
  toggle: () => void;
  push: (entry: PanelEntry) => void;
  pop: () => void;
  focusSection: (id: string) => void;
};

const RightPanelContext = createContext<RightPanelApi | null>(null);

export function useRightPanel(): RightPanelApi {
  const value = useContext(RightPanelContext);
  if (!value) {
    // 🚨 これは利用者ではなく**作る側**へのメッセージなので辞書へ入れない（画面には出ない）。
    //    日本語で書くと `check-i18n-hardcoded` が UI 文言として拾うため、英語で書く。
    throw new Error("useRightPanel was called outside RightPanelProvider");
  }
  return value;
}

/** md 以上か。**サーバでは分からない**ので、開くまで判断しない（閉じている間は何も描かない）。 */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(min-width: 768px)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(min-width: 768px)").matches,
    () => false,
  );
}

export function RightPanelProvider({
  brand,
  children,
}: {
  brand: string;
  children: ReactNode;
}) {
  // 🚨 「開いているか」ではなく **「どの経路で開いたか」** を持つ。
  //    前へ進んでも戻っても、**いまの経路と違えば閉じている**ことになる。
  //    こうしないと、戻ったときに Next が state ごと復元してパネルだけ復活する
  //    （2026-08-17 実測: 直す前は 移動しても戻っても aside=1 のままだった）。
  //    🚨 効果（useEffect）で閉じる形にはしない。lint が「効果の中の同期 setState」を拒む。
  const pathname = usePathname();
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const [stack, setStack] = useState<PanelEntry[]>([]);
  const [focusRequest, setFocusRequest] = useState<{ id: string; version: number } | null>(null);
  const isOpen = openedAt === pathname;

  // 🚨 戻る／進むのときは、経路で導出するだけでは閉じない。
  //    **`openedAt` も一緒に復元される**ので、戻った先で経路が再び一致してしまう
  //    （2026-08-17 実測: 導出だけにしたら、戻ったあと aside=1 に戻った）。
  //    そこで **popstate を購読して閉じる**（購読は効果の本来の用途で、lint も通る）。
  useEffect(() => {
    const onPop = () => setOpenedAt(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const open = useCallback(() => setOpenedAt(pathname), [pathname]);
  const toggle = useCallback(
    () => setOpenedAt((current) => (current === pathname ? null : pathname)),
    [pathname],
  );

  const close = useCallback(() => {
    setOpenedAt(null);
    // 🚨 閉じたら積み重ねを捨てる。残すと、次に info を押したときに
    //    **前回書きかけの報告フォームが出てくる**（何を押したのか説明できない）。
    setStack([]);
  }, []);

  const push = useCallback((entry: PanelEntry) => {
    setStack((current) => {
      // 同じものを二重に積まない（同じボタンを2回押しても深さは増えない）
      const withoutSame = current.filter((item) => item.key !== entry.key);
      return [...withoutSame, entry];
    });
    setOpenedAt(pathname);
  }, [pathname]);

  const pop = useCallback(() => setStack((current) => current.slice(0, -1)), []);
  const focusSection = useCallback((id: string) => {
    setFocusRequest((current) => ({ id, version: (current?.version ?? 0) + 1 }));
    setStack([]);
    setOpenedAt(pathname);
  }, [pathname]);

  const api = useMemo<RightPanelApi>(
    () => ({ isOpen, depth: stack.length + 1, open, close, toggle, push, pop, focusSection }),
    [isOpen, stack.length, open, close, toggle, push, pop, focusSection],
  );

  return (
    <RightPanelContext value={api}>
      {children}
      <RightPanelSurface brand={brand} stack={isOpen ? stack : []} focusRequest={focusRequest} />
    </RightPanelContext>
  );
}

/** ヘッダー右の info。押すと開閉する。 */
export function RightPanelToggle() {
  const t = useT("panel");
  const isMac = useIsMac();
  const { toggle, isOpen } = useRightPanel();

  useShortcut(SHORTCUTS.toggleRightSidebar, toggle);

  return (
    // 🚨 **アイコンだけのボタンなので、目で見る人には名前が 1 文字も出ていなかった**
    //    （2026-08-17 実測: 3 画面とも「見えている true・押せる true」だが、
    //      文字は無く `aria-label` だけ ＝ 読み上げでは読めるが、見る人には ⓘ の絵だけ）。
    // 🚨 これは §1-11（居座る画面には「この画面は何か」を出す）の**実効性の穴**だった。
    //    説明は右パネルの「概要」に在るが、**右パネルは既定で閉じ、遷移でも閉じる**
    //    （実測: 開いた直後 aside 0 → ⌘J で 1 → 遷移で 0 → 戻っても 0）。
    //    ＝ 説明へ入る道はこのボタン 1 つで、その名前が見えていなかった。
    // 🚨 **名前も出す**（header-back は「名前は既にボタンに見えている」ので鍵だけにしている。
    //    こちらは名前が見えていないので、**名前 ＋ 鍵**。同じ語を 2 回出す形にはならない）。
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={toggle}
          aria-label={t("open")}
          aria-expanded={isOpen}
          // 🚨 `aria-expanded` だけでは名指しできない。同じヘッダーの中でパンくずの
          //    ドロップダウンも `aria-expanded` を持つので、検証が**別のボタンを押していた**
          //    （実測: info を押したつもりでパンくずが開き、「開かない」と誤診しかけた）。
          data-slot="right-panel-toggle"
          className="text-muted-foreground"
        >
          <InfoIcon />
        </Button>
      </TooltipTrigger>
      {/* 🚨 記号は環境で変わるので辞書に入れない（header-back と同じ作法）。 */}
      <TooltipContent side="bottom">
        {`${t("open")}  ${formatShortcut(SHORTCUTS.toggleRightSidebar, isMac)}`}
      </TooltipContent>
    </Tooltip>
  );
}

function RightPanelSurface({
  brand,
  stack,
  focusRequest,
}: {
  brand: string;
  stack: PanelEntry[];
  focusRequest: { id: string; version: number } | null;
}) {
  const { isOpen, close } = useRightPanel();
  const isDesktop = useIsDesktop();

  // 閉じている間は何も描かない。描く判断に画面幅を使うので、
  // 「サーバでは分からない」を開くまで持ち越せる。
  if (!isOpen) return null;

  if (isDesktop) {
    return (
      // 面は「罫線・背景・影」のうち1つだけ（憲章 §1）。左サイドバーと同じく罫線1本。
      <aside className="flex w-80 shrink-0 flex-col border-l">
        <PanelBody brand={brand} stack={stack} focusRequest={focusRequest} />
      </aside>
    );
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next) close(); }}>
      {/* SP は `dialog.tsx` の既定で画面いっぱいになる（design が 0d56b4b で入れた）。 */}
      <DialogContent showCloseButton={false} className="p-0">
        <PanelBody brand={brand} stack={stack} focusRequest={focusRequest} inDialog />
      </DialogContent>
    </Dialog>
  );
}

function PanelBody({
  brand,
  stack,
  focusRequest,
  inDialog = false,
}: {
  brand: string;
  stack: PanelEntry[];
  focusRequest: { id: string; version: number } | null;
  inDialog?: boolean;
}) {
  const tCommon = useT("common");
  // 🚨 **`titleKey` は名前空間つきの完全なキー**（"reports.create_title"）なので、
  //    名前空間を付けない翻訳関数で引く。`useT("panel")` で引くと `panel.` が二重に付き、
  //    見出しに **"panel.reports.create_title" というキー文字列がそのまま出る**
  //    （polish が実測して報告してくれた。押し込む側の部品がまだ無く、
  //     深さ1しか描けなかったので、私のブラウザ検証では踏めなかった）。
  //    兄弟の `page-info-panel.tsx` も同じ理由で名前空間なしを使っている。
  const tKey = useT();
  const { close, pop, depth } = useRightPanel();
  const trail = usePageTrail(brand);

  const top = stack[stack.length - 1];
  // 深さ1の見出しは**そのページの名前**。パンくずと同じものを読むので食い違わない。
  const title = top ? tKey(top.titleKey) : (trail[trail.length - 1]?.label ?? brand);

  const heading = (
    <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
  );

  return (
    // 🚨 `min-w-0` が要る（DESIGN.md §7-1「PC 幅だけで測らない」で見つけた）。
    //    flex の子は既定が `min-width: auto` ＝ **中身より小さくならない**。
    //    SP は全画面ダイアログなので、中の「LLM へ渡すプロンプト」（`w-max` の pre）が
    //    そのままこの器を押し広げていた。実測（幅 390・/admin/content/<c>）:
    //      節を開く前 …………………… はみ出す要素 **0**
    //      🚨 API・MCP を開いた後 … はみ出す要素 **73** ／ ダイアログの幅 **904**（画面は 390）
    //    ＝ 横に流せる箱（ScrollArea）は在ったのに、**その外側が縮めなかった**ので効いていなかった。
    // 🚨 PC でも同じ器を使う。PC は幅が決まっているので見た目は変わらない（実測で確認済み）。
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-14 shrink-0 items-center gap-1 border-b px-2">
        {/* 🚨 戻るボタンは**深さが2以上のときだけ**。押し込んだ側に描かせない
            （描かせると、押し込む場所ごとに戻る動きが割れる）。 */}
        {depth > 1 ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={pop}
            aria-label={tCommon("shortcut_back")}
          >
            <ArrowLeftIcon />
          </Button>
        ) : null}
        {/* ダイアログには見出しの要素が要る（読み上げの対象になる）。 */}
        {inDialog ? <DialogTitle asChild>{heading}</DialogTitle> : heading}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={close}
          aria-label={tCommon("close")}
        >
          <XIcon />
        </Button>
      </div>

      <ScrollFade direction="vertical" className="min-h-0 flex-1 px-3 py-2">
        {top ? top.node : <PageInfoPanel focusRequest={focusRequest} />}
      </ScrollFade>
    </div>
  );
}
