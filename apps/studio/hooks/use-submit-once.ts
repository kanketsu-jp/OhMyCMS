"use client";

import { useRef, useState } from "react";

/**
 * 送信の二重発火を止める。
 *
 * 🚨 なぜ `useState` ではダメか:
 * `setState` は非同期で、次のレンダーまで値が変わらない。
 * ボタンを素早く2回押すと **1回目の `setSubmitting(true)` が反映される前に2回目のハンドラが走る**。
 * `disabled={submitting}` も同じ理由で間に合わない（描画されるのは次のレンダー）。
 * → **同期的に読み書きできる `useRef` で門を閉じる**。`useState` は「見た目（スピナー・無効化）」専用。
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
  const [pendingKeys, setPendingKeys] = useState<readonly string[]>([]);

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
    setPendingKeys([...inFlight.current]);

    try {
      await handler(...args);
    } finally {
      // 🚨 finally は必須。早期 return も例外も、ここを必ず通す。
      // 通らないと門が閉じたままになり、そのボタンは二度と押せない。
      inFlight.current.delete(key);
      setPendingKeys([...inFlight.current]);
    }
  }

  return {
    run,
    pending: pendingKeys.length > 0,
    isPending: (key: string) => pendingKeys.includes(key),
  };
}
