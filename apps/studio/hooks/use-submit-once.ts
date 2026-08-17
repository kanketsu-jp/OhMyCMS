"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

/**
 * 送信の二重発火を止める。
 *
 * 🚨 なぜ `useState` ではダメか:
 * `setState` は非同期で、次のレンダーまで値が変わらない。
 * ボタンを素早く2回押すと **1回目の `setSubmitting(true)` が反映される前に2回目のハンドラが走る**。
 * `disabled={submitting}` も同じ理由で間に合わない（描画されるのは次のレンダー）。
 * → **同期的に読み書きできる `useRef` で門を閉じる**。描画（スピナー・無効化）は別に持つ。
 * 🚨 **その描画側は 2026-08-17 に `useState` から外部ストアへ移した**（下の `snapshot` の節に理由）。
 *   `useState` のままだと、**`<form action={fn}>` の中では途中の状態が 1 度も描かれない**。
 *
 * 🚨 なぜ 1 箇所ずつ書かないか:
 * 送信経路は 16 本ある。同じコードを 16 回書くと、
 * `try`/`finally` を1箇所忘れた瞬間に**そのボタンが二度と押せなくなる**（門が閉じたまま）。
 * 早期 return が複数ある関数が多いので、これは必ず起きる。→ フック1本に寄せる。
 *
 * ## 使い方
 *
 * ```tsx
 * // 単発（フォーム送信・作成・保存）
 * const create = useSubmitOnce(async (formData: FormData) => { ... });
 * <form action={create.run}>
 *   <Button type="submit" disabled={create.pending}>作成</Button>
 * </form>
 *
 * // 行ごと（一覧の削除ボタン）— 🚨 keyOf を渡すこと
 * const remove = useSubmitOnce(async (id: string) => { ... }, (id) => id);
 * <Button disabled={remove.isPending(row.id)} onClick={() => void remove.run(row.id)}>削除</Button>
 * ```
 *
 * 🚨 **行ごとの操作で `keyOf` を省くと、1行を削除している間に他の行が押せなくなる。**
 * 逆に単発の送信で `keyOf` を渡す必要はない（引数が無いので鍵が作れない）。
 */

const SINGLE = "__single__";

/** 空のときは**同じ配列**を返す（`useSyncExternalStore` は毎回新しい値を返すと無限ループになる）。 */
const NONE: readonly string[] = [];

export type SubmitOnce<A extends unknown[]> = {
  /** ハンドラを実行する。実行中の呼び出しは**黙って捨てられる**（例外にしない）。 */
  run: (...args: A) => Promise<void>;
  /** 何か1つでも実行中か。単発の送信ではこれを `disabled` に渡す。 */
  pending: boolean;
  /** その鍵の操作が実行中か。行ごとの操作ではこれを `disabled` に渡す。 */
  isPending: (key: string) => boolean;
};

export function useSubmitOnce<A extends unknown[]>(
  handler: (...args: A) => Promise<void>,
  keyOf?: (...args: A) => string,
): SubmitOnce<A> {
  // 🚨 同期的な門。描画には使わない（描画は下の pendingKeys）。
  const inFlight = useRef<Set<string>>(new Set());

  /**
   * 🚨 **描画側を `useState` から「外部ストア」へ移した**（2026-08-17）。
   *
   * 由来: 5.7MB のアップロードで **1.23 秒のあいだボタンの見た目が 1 度も変わらなかった**
   * （司令塔が 10ms 刻みで実測。`aria-disabled` / `data-loading` / スピナーのどれも付かず、
   *  1230ms で「ボタンが消えた＝一覧へ遷移」だけが記録された。**送信自体は成功**していた）。
   *
   * 原因: **`<form action={fn}>` は React 19 のトランザクション（transition）で走る**。
   * その中で呼んだ `setState` は「動作が終わるまで」まとめて反映されるので、
   * **途中の `pending = true` は 1 度も描かれない**。終わった時点では `false` に戻っているため、
   * **差し引きで「何も起きていない」ように見える**（React が `useOptimistic` を用意している理由と同じ）。
   *
   * 🚨 **`useState` を残したまま直す方法は無い。** `flushSync` は transition の中では使えず、
   * `useFormStatus` は**フックなので `components/ui/button.tsx` から呼べない**
   * （あの部品は**サーバから使える状態を保つ**ために `"use client"` を持たない）。
   * → **外部ストアにする。** `useSyncExternalStore` からの更新は transition に畳まれず、
   *   その場で描き直される。**この PJ は `right-panel.tsx` の `useSlot` で既に同じ形を使っている**。
   *
   * 🚨 **門（`inFlight`）はそのまま。** 二重送信を止めているのは今までどおり ref の同期チェックで、
   *   ここで変えたのは**見た目の伝わり方だけ**。
   */
  const snapshot = useRef<readonly string[]>(NONE);
  const listeners = useRef<Set<() => void>>(new Set());

  const subscribe = useCallback((onChange: () => void) => {
    listeners.current.add(onChange);
    return () => {
      listeners.current.delete(onChange);
    };
  }, []);
  // 🚨 毎回 `[...inFlight]` を作って返してはいけない（参照が変わり続けて再描画が止まらない）。
  //    `publish()` のときだけ作り直し、それ以外は同じ参照を返す。
  const getSnapshot = useCallback(() => snapshot.current, []);
  const pendingKeys = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  function publish(): void {
    snapshot.current = inFlight.current.size === 0 ? NONE : [...inFlight.current];
    for (const onChange of listeners.current) onChange();
  }

  // 🚨 `run` を `useCallback` で固定しない。
  // 最新の handler を掴むために ref へ写す書き方（`handlerRef.current = handler`）は、
  // **レンダー中に ref を書く**ことになり React Compiler の `react-hooks/refs` に弾かれる。
  // 毎レンダー作り直して構わない——**門は `inFlight`（ref）側にあり、
  // 関数の同一性とは無関係に閉じたまま**だから。
  async function run(...args: A): Promise<void> {
    const key = keyOf ? keyOf(...args) : SINGLE;
    // 🚨 await より前に、同期で見て・同期で閉じる。ここに await を挟むと門が意味を失う。
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    publish();

    try {
      await handler(...args);
    } finally {
      // 🚨 finally は必須。早期 return も例外も、ここを必ず通す。
      // 通らないと門が閉じたままになり、そのボタンは二度と押せない。
      inFlight.current.delete(key);
      publish();
    }
  }

  return {
    run,
    pending: pendingKeys.length > 0,
    isPending: (key: string) => pendingKeys.includes(key),
  };
}
