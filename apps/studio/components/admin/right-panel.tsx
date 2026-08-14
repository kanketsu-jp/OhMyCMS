"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ArrowLeftIcon, InfoIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { PageInfoPanel } from "@/components/admin/page-info-panel";
import { usePageTrail } from "@/components/admin/page-trail";
import { SHORTCUTS } from "@/components/admin/shortcuts";
import { useShortcut } from "@/components/admin/use-shortcut";
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
  const [isOpen, setIsOpen] = useState(false);
  const [stack, setStack] = useState<PanelEntry[]>([]);

  const open = useCallback(() => setIsOpen(true), []);
  const toggle = useCallback(() => setIsOpen((value) => !value), []);

  const close = useCallback(() => {
    setIsOpen(false);
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
    setIsOpen(true);
  }, []);

  const pop = useCallback(() => setStack((current) => current.slice(0, -1)), []);

  const api = useMemo<RightPanelApi>(
    () => ({ isOpen, depth: stack.length + 1, open, close, toggle, push, pop }),
    [isOpen, stack.length, open, close, toggle, push, pop],
  );

  return (
    <RightPanelContext value={api}>
      {children}
      <RightPanelSurface brand={brand} stack={stack} />
    </RightPanelContext>
  );
}

/** ヘッダー右の info。押すと開閉する。 */
export function RightPanelToggle() {
  const t = useT("panel");
  const { toggle, isOpen } = useRightPanel();

  useShortcut(SHORTCUTS.toggleRightSidebar, toggle);

  return (
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
  );
}

function RightPanelSurface({ brand, stack }: { brand: string; stack: PanelEntry[] }) {
  const { isOpen, close } = useRightPanel();
  const isDesktop = useIsDesktop();

  // 閉じている間は何も描かない。描く判断に画面幅を使うので、
  // 「サーバでは分からない」を開くまで持ち越せる。
  if (!isOpen) return null;

  if (isDesktop) {
    return (
      // 面は「罫線・背景・影」のうち1つだけ（憲章 §1）。左サイドバーと同じく罫線1本。
      <aside className="flex w-80 shrink-0 flex-col border-l">
        <PanelBody brand={brand} stack={stack} />
      </aside>
    );
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next) close(); }}>
      {/* SP は `dialog.tsx` の既定で画面いっぱいになる（design が 0d56b4b で入れた）。 */}
      <DialogContent showCloseButton={false} className="p-0">
        <PanelBody brand={brand} stack={stack} inDialog />
      </DialogContent>
    </Dialog>
  );
}

function PanelBody({
  brand,
  stack,
  inDialog = false,
}: {
  brand: string;
  stack: PanelEntry[];
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
    <div className="flex min-h-0 flex-1 flex-col">
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
        {inDialog ? <DialogTitle render={heading} /> : heading}
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
        {top ? top.node : <PageInfoPanel />}
      </ScrollFade>
    </div>
  );
}
