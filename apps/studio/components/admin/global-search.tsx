"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SHORTCUTS, formatShortcut } from "@/components/admin/shortcuts";
import { useIsMac, useShortcut } from "@/components/admin/use-shortcut";
import { useT } from "@/i18n/client";

type SearchHit = { label: string; hint?: string; href: string };

type SearchResult = {
  items: SearchHit[];
  files: SearchHit[];
  collections: SearchHit[];
  settings: SearchHit[];
  pages: SearchHit[];
  users: SearchHit[];
};

const EMPTY: SearchResult = {
  items: [],
  files: [],
  collections: [],
  settings: [],
  pages: [],
  users: [],
};

/** 表示する順番。仕様 §2-1 の並びに合わせる。 */
const GROUPS: { key: keyof SearchResult; labelKey: string }[] = [
  { key: "items", labelKey: "group_items" },
  { key: "files", labelKey: "group_files" },
  { key: "collections", labelKey: "group_collections" },
  { key: "settings", labelKey: "group_settings" },
  { key: "pages", labelKey: "group_pages" },
  { key: "users", labelKey: "group_users" },
];

/**
 * 横断検索（F2-J §2-3）。
 *
 * 🚨 **「起動ボタン」と「ダイアログ本体」を分けてある。**
 *    以前は1つの部品が両方を描いていた。検索の起動ボタンは
 *    **PC は左サイドバーの上部・SP はドロワーの中**の2箇所に要るので、
 *    そのままだと**ダイアログが2つ・`⌘K` の購読も2つ**になる（同じキーに2つ反応する）。
 *    → 本体は `GlobalSearchProvider` が**1つだけ**描き、ボタンは何個でも置ける。
 *
 * 🚨 **絞り込みはサーバでやる。** cmdk は入力に対して自前で候補を絞る機能を持つが、
 *    それを使うと「サーバが権限で弾いた結果」の上にクライアントの絞り込みが乗り、
 *    **何が効いているのか分からなくなる**。`shouldFilter={false}` にして、
 *    表示するのはサーバが返したものだけにしている。
 *
 * 🚨 **文言は必ず辞書から。** 実データ（アイテムのタイトル・ファイル名・コレクション名）
 *    だけがそのまま出る。設定項目と画面の名前はサーバが辞書で引いて返してくる。
 */

const GlobalSearchContext = createContext<{ open: () => void } | null>(null);

function useGlobalSearch(): { open: () => void } {
  const value = useContext(GlobalSearchContext);
  if (!value) {
    // 作る側へのメッセージ（画面には出ない）。日本語で書くと i18n の検査が UI 文言として拾う。
    throw new Error("GlobalSearchButton was used outside GlobalSearchProvider");
  }
  return value;
}

export function GlobalSearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen((value) => !value), []);

  // 🚨 `⌘K` は検索が占有する（`shortcuts.ts`）。**入力中でも効かせる**のは、
  //    これが編集操作ではなく**どこからでも呼べる移動手段**だから（従来の挙動も同じ）。
  //    その代わり `⌘K` を他の用途へ割り当てないこと（WYSIWYG のリンク挿入も別のキーにする）。
  useShortcut(SHORTCUTS.search, toggle, { whileTyping: true });

  const api = useMemo(() => ({ open: () => setOpen(true) }), []);

  return (
    <GlobalSearchContext value={api}>
      {children}
      <SearchDialog open={open} onOpenChange={setOpen} />
    </GlobalSearchContext>
  );
}

/** 検索を開くボタン。**いくつ置いてもよい**（本体は Provider が1つだけ描く）。 */
export function GlobalSearchButton({ className }: { className?: string }) {
  const t = useT("search");
  const { open } = useGlobalSearch();
  const isMac = useIsMac();

  return (
    // 🚨 **ショートカットはバッジで出さない。ツールチップで見せる**
    //    （堀池・2026-08-17・Y1「ショートカットバッジは窮屈なので、**すべて廃止**。
    //      代わりにツールチップにする」／`DESIGN.md` §2-4）。
    //    🚨 **「すべて」なので、ここも対象**。実測（2026-08-17）: バッジは画面全体で 3 件在り、
    //      ヘッダーの 2 件（もどる・保存）は 0d42cc1 で外した。**残っていたのがここ 1 件**。
    //    🚨 これは header(L3) が shell(L1) の持ち場へ入って直した分。1 行だけで、検索の中身は触っていない。
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={open}
          aria-label={t("open_hint")}
          className={`flex h-(--control-h) w-full items-center gap-2 rounded-lg bg-muted/60 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted active:bg-muted md:h-(--control-h-pc) ${className ?? ""}`}
        >
          <SearchIcon className="size-4 shrink-0" />
          <span className="flex-1 text-left">{t("placeholder")}</span>
        </button>
      </TooltipTrigger>
      {/* 記号は環境で変わるので辞書に持たせない（mac は ⌘K / それ以外は Ctrl+K）。 */}
      <TooltipContent side="right">{formatShortcut(SHORTCUTS.search, isMac)}</TooltipContent>
    </Tooltip>
  );
}

function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const t = useT("search");
  const pathname = usePathname();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"all" | "page">("all");
  const [result, setResult] = useState<SearchResult>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // 打つたびに投げないよう遅延させる。最後の入力だけを使う。
  const latest = useRef(0);

  /**
   * 入力が変わったときの後始末は**ハンドラ側**でやる。
   * 🚨 effect の中で直接 setState すると react-hooks/set-state-in-effect に落ちる
   *    （lint がエラーにする）。空になった瞬間の結果消去はここが正しい場所。
   */
  const onQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (value.trim().length === 0) {
      setResult(EMPTY);
      setLoading(false);
      setFailed(false);
    }
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length === 0) return;

    const token = ++latest.current;
    const timer = setTimeout(async () => {
      // 状態の更新はすべてこの非同期コールバックの中で行う（effect の直下では行わない）。
      setLoading(true);
      setFailed(false);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        // 打つのが速いと応答が前後する。**最後の入力の結果だけ**を採用する。
        if (token !== latest.current) return;
        if (!response.ok) {
          setResult(EMPTY);
          setFailed(true);
          return;
        }
        const payload = (await response.json()) as { data: SearchResult };
        setResult(payload.data ?? EMPTY);
      } catch {
        if (token === latest.current) {
          setResult(EMPTY);
          setFailed(true);
        }
      } finally {
        if (token === latest.current) setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  const pageKinds = useMemo<(keyof SearchResult)[]>(() => {
    if (pathname.startsWith("/admin/files")) return ["files"];
    if (
      pathname.startsWith("/admin/content") ||
      pathname.startsWith("/admin/collections")
    ) {
      return ["items", "collections"];
    }
    if (pathname.startsWith("/admin/settings")) return ["settings"];
    return ["pages"];
  }, [pathname]);

  const visibleGroups = useMemo(
    () =>
      scope === "all"
        ? GROUPS
        : GROUPS.filter((group) => pageKinds.includes(group.key)),
    [pageKinds, scope],
  );

  const handleOpenChange = useCallback(
    (value: boolean) => {
      if (!value) {
        setScope("all");
        setQuery("");
      }
      onOpenChange(value);
    },
    [onOpenChange],
  );

  const go = useCallback(
    (href: string) => {
      handleOpenChange(false);
      router.push(href);
    },
    [router, handleOpenChange],
  );

  const total = visibleGroups.reduce(
    (n, group) => n + result[group.key].length,
    0,
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={t("dialog_title")}
      description={t("dialog_description")}
    >
      {/* 🚨 絞り込みはサーバが済ませているので、cmdk 側の絞り込みは切る。 */}
      <Command shouldFilter={false}>
        <div
          role="tablist"
          className="mx-3 mt-3 grid grid-cols-2 rounded-lg bg-muted p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={scope === "all"}
            onClick={() => setScope("all")}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-background/80 active:bg-background ${
              scope === "all"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground"
            }`}
          >
            {t("scope_all")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={scope === "page"}
            onClick={() => setScope("page")}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-background/80 active:bg-background ${
              scope === "page"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground"
            }`}
          >
            {t("scope_page")}
          </button>
        </div>
        {/* 🚨 **`autoFocus` は飾りではない。** 切り替えのボタンを入力欄より前に置いた瞬間、
            ダイアログが最初に焦点を当てる先が**そのボタン**になり、
            **開いてすぐ打っても 1 文字も入らなくなった**（実測 2026-08-17:
            入力欄の値 "" ／ 焦点が入力欄か false ／ 見出し 0 件。
            🟢 対照 同じときに `/api/search?q=a` は 200 で items 5・collections 5 を返していた
            ＝ 検索が壊れたのではなく、**打った文字が入力欄に届いていなかった**）。
            切り替えを入力欄の**上**に置くのは堀池さんの「分かりやすい UI」の形なので動かさず、
            **焦点だけを入力欄へ戻す**。 */}
        <CommandInput
          autoFocus
          value={query}
          onValueChange={onQueryChange}
          placeholder={t("placeholder")}
        />
        {/* CommandList はそれ自体がスクロールする箱（`command.tsx` が `scroll-fade-y` を持つ）。 */}
        <CommandList>
          {query.trim().length === 0 ? (
            <CommandEmpty>{t("prompt")}</CommandEmpty>
          ) : failed ? (
            <CommandEmpty>{t("error")}</CommandEmpty>
          ) : loading && total === 0 ? (
            <CommandEmpty>{t("loading")}</CommandEmpty>
          ) : total === 0 ? (
            <CommandEmpty>{t("empty")}</CommandEmpty>
          ) : null}

          {visibleGroups.map(({ key, labelKey }) =>
            result[key].length > 0 ? (
              <CommandGroup key={key} heading={t(labelKey)}>
                {result[key].map((hit) => (
                  <CommandItem
                    key={`${key}:${hit.href}`}
                    value={`${key}:${hit.href}`}
                    onSelect={() => go(hit.href)}
                  >
                    <span className="truncate">{hit.label}</span>
                    {hit.hint ? (
                      <span className="ml-auto truncate text-xs text-muted-foreground">
                        {hit.hint}
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null,
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
