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
import { useRouter } from "next/navigation";
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
import { Kbd } from "@/components/ui/kbd";
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
};

const EMPTY: SearchResult = {
  items: [],
  files: [],
  collections: [],
  settings: [],
  pages: [],
};

/** 表示する順番。仕様 §2-1 の並びに合わせる。 */
const GROUPS: { key: keyof SearchResult; labelKey: string }[] = [
  { key: "items", labelKey: "group_items" },
  { key: "files", labelKey: "group_files" },
  { key: "collections", labelKey: "group_collections" },
  { key: "settings", labelKey: "group_settings" },
  { key: "pages", labelKey: "group_pages" },
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
    <button
      type="button"
      onClick={open}
      aria-label={t("open_hint")}
      className={`flex h-(--control-h) w-full items-center gap-2 rounded-lg bg-muted/60 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted active:bg-muted md:h-(--control-h-pc) ${className ?? ""}`}
    >
      <SearchIcon className="size-4 shrink-0" />
      <span className="flex-1 text-left">{t("placeholder")}</span>
      {/* 記号は環境で変わるので辞書に持たせない（mac は ⌘K / それ以外は Ctrl+K）。 */}
      <Kbd className="hidden sm:inline-flex">{formatShortcut(SHORTCUTS.search, isMac)}</Kbd>
    </button>
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
  const router = useRouter();

  const [query, setQuery] = useState("");
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

  const go = useCallback(
    (href: string) => {
      onOpenChange(false);
      setQuery("");
      router.push(href);
    },
    [router, onOpenChange],
  );

  const total = GROUPS.reduce((n, group) => n + result[group.key].length, 0);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("dialog_title")}
      description={t("dialog_description")}
    >
      {/* 🚨 絞り込みはサーバが済ませているので、cmdk 側の絞り込みは切る。 */}
      <Command shouldFilter={false}>
        <CommandInput
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

          {GROUPS.map(({ key, labelKey }) =>
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
