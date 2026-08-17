"use client";

import {
  createContext,
  useCallback,
  useContext,
  type ReactNode,
} from "react";

const CollectionLabelsContext = createContext<Record<string, string>>({});

/**
 * コレクション表示名の対応表を、管理画面のクライアント側コンポーネントへ配る。
 *
 * 左サイドバー・見出し・パンくずなど、実際に名前を描く側はクライアントで動くため、
 * サーバ側のスキーマ情報や翻訳辞書を直接持てない。そこでレイアウト側が解決済みの
 * 対応表をここへ渡し、描く側は識別子から表示名だけを引けるようにする。
 *
 * 対応表に無い識別子は、その識別子がそのまま返る。Provider の付け忘れや値の不足で
 * 画面は壊れないが、表示が識別子のまま残るため気づきにくい。
 */
export function CollectionLabelsProvider({
  value,
  children,
}: {
  value: Record<string, string>;
  children: ReactNode;
}) {
  return (
    <CollectionLabelsContext.Provider value={value}>
      {children}
    </CollectionLabelsContext.Provider>
  );
}

/**
 * コレクション識別子から、レイアウト側が配った表示名を返す。
 *
 * 描く側はクライアントなので翻訳を持てない。対応表に無いときは識別子をそのまま返し、
 * 例外や空文字で画面を壊さない。ただし付け忘れても識別子表示として成立するため、
 * Provider や値の不足に気づきにくい点に注意する。
 */
export function useCollectionLabel(): (identifier: string) => string {
  const labels = useContext(CollectionLabelsContext);
  return useCallback((identifier: string) => labels[identifier] ?? identifier, [labels]);
}
