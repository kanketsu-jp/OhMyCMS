"use client";

import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal, useFormStatus } from "react-dom";

import { ConfirmDialog, submitFormById, type ConfirmSpec } from "@/components/admin/confirm-dialog";

import { SHORTCUTS, formatShortcut } from "@/components/admin/shortcuts";
import { useIsMac, useShortcut } from "@/components/admin/use-shortcut";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button, buttonVariants } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

/**
 * 押し方は**ページの性質で決まる**（`lib/admin/page-actions.ts` の `kind`）。
 * ちょうど 1 つだけ渡すこと。
 *
 * - `href`    … 次の画面へ行く（一覧 → 新規作成）
 * - `form`    … ページの中の `<form id="...">` を、**その外にある**ボタンから送る。
 *               HTML の `form` 属性で成立する。ヘッダーへ「保存」を出すにはこれが要る。
 * - `onClick` … その場で何かする（すべて既読にする・報告を開く 等）
 */
type Props = {
  /** PC/SP で出す文字 */
  label: string;
  /** アイコン */
  icon: ReactNode;
  href?: string;
  form?: string;
  onClick?: () => void;
  /**
   * 実行中。押せなくしてスピナーを出す。
   * 🚨 二重送信の防止は `Button` の `loading` が持っている（`button.tsx` の申し送り参照）。
   */
  pending?: boolean;
  /**
   * 主要か補助か。**主要は 1 ページに 1 つだけ**（`page-actions.ts` の role と対応）。
   * 補助は枠線だけにして、主要との差を色で付ける。
   */
  role?: "primary" | "secondary";
  /** 取り消せない操作。塗らずに赤い枠線にする（憲章 §3b） */
  destructive?: boolean;
  /**
   * まだ押させない。**憲章 §3c「未入力なら確定ボタンを無効にする」**（薄くするのでなく `disabled`）。
   *
   * 🚨 `pending` とは別物。`pending` は「いま実行中」、`disabled` は「そもそも内容が足りない」。
   *    2026-08-15、ヘッダーへ移す作業で **内容に基づく判定が3画面で消えた**
   *    （SSO の `!ready` / ストレージの `!dirty` / 権限付与の「対象が0件」）。
   *    prop が無いと表現できないので、置き換え先として足した。
   */
  disabled?: boolean;
  /** 押せない主操作の理由。無効時も操作の存在と理由を知らせる。 */
  disabledReason?: string;
  /**
   * ▾ の中に入れる操作。**空/未指定なら chevron は出ない**（ボタン 1 つのまま）。
   *
   * 由来: 堀池さん 2026-08-15「アクションボタンは一つのボタン＋右に chevron-down アイコン。
   * これを押下するとオプションが表示される」／規約 `knowledge/decisions/action-button-and-edit-mode.md`。
   *
   * 🚨 入れるもの: **たまにしか使わない操作**と**破壊的な操作**（削除は必ずここ）。
   *    入れないもの: その画面の**主目的**（それは主ボタン）。
   */
  options?: ActionOption[];
};

export type ActionOption = {
  label: string;
  onSelect?: () => void;
  href?: string;
  /**
   * ページの中の `<form id="...">` を送る。
   *
   * 🚨 **Server Component から ▾ を使うには、これが要る**（2026-08-16）。
   *    `onSelect` は**関数なので Server Component から渡せない**（シリアライズできない）。
   *    削除のように「フォームを送る」操作は、**id を文字列で渡す**形でしか表せない。
   */
  formId?: string;
  /** フォーム送信時に追加する操作名（例: `_method=delete`）。 */
  submitName?: string;
  submitValue?: string;
  /** 取り消せない操作。赤く出す（規約 §3「破壊的な操作は必ず ▾ の中」） */
  destructive?: boolean;
  /**
   * 渡すと、押したときに**確認を挟む**（`knowledge/decisions/confirm-by-reversibility-and-reach`）。
   *
   * 🚨 **既定は確認なし**（渡さなければ、いままでと 1 文字も変わらない）。
   * 🚨 **「これは危ない」を部品が決めない**——**呼ぶ側が渡したときだけ**出す（司令塔の条件①）。
   *   `destructive`（赤くする）とは**別**: 赤いから確認、ではない。
   */
  confirm?: ConfirmSpec;
};

/**
 * そのページの**アクションボタン**。
 *
 * 由来（堀池・2026-08-15 原文・ヘッダーの構成）:
 * > 「その次にアクションボタン（**SPと同じ**）（一番右）」
 *
 * → **PC はヘッダー右の `#header-primary-action`**、**SP は下部ナビ右端の
 *   `#mobile-primary-action`** へ portal で差し込む。**どちらも同じ props から出す**ので、
 *   PC と SP で中身が食い違わない。
 *
 * 🚨 **以前は PC だけページの見出しの横に直接描いていた。** 見出しをページから
 *    撤去した（名前はパンくずが出す）ので、置き場所が無くなった。ヘッダーへ移した。
 *
 * 🚨 portal 先は**空でも幅を確保して**置いてある枠。埋めた瞬間に周りがずれないようにするため。
 *
 * 🚨 SSR では `document` が無いので、サーバ側の HTML には**どちらも出ない**（水和のあとに現れる）。
 *    その「サーバでは無い／クライアントには在る」を `useSyncExternalStore` で表す。
 *    `useEffect` の中で `setState` する形にすると React Compiler の lint が error にする。
 */
export function PageAction({
  href,
  form,
  onClick,
  label,
  icon,
  pending = false,
  role = "primary",
  destructive = false,
  disabled = false,
  disabledReason,
  options,
}: Props) {
  const t = useT("common");
  const headerSlot = useSlot("header-primary-action");
  const mobileSlot = useSlot("mobile-primary-action");

  /**
   * 🚨 **フォームで送っている間も「働いている」を出す**（2026-08-17）。
   *
   * 由来: 5.7MB のアップロードで、**送信の 1077ms のうち最初の 43ms しか印が出なかった**
   * （司令塔が MutationObserver で実測: 21ms で `aria-disabled` / `data-loading` が付き、
   *  **64ms で両方 null に戻る**。残り 1 秒は直る前と同じ見た目）。
   *
   * 原因（**推測を残す**）: `<form action={fn}>` は React 19 のトランザクションで走るので、
   * **こちら側の state をどう持っても、トランザクション側の描画に上書きされうる**。
   * `hooks/use-submit-once.ts` を外部ストアにして「出る」ところまでは来たが、**続かなかった**。
   *
   * 🚨 だから**自前の state で戦うのをやめる**。`useFormStatus` は
   * **React がそのフォームの動作の間ずっと true にする**もので、上書きの心配が無い。
   *
   * 🚨 **フォームの中に置かれた `PageAction` にしか効かない**（React の仕様。
   *   フォームの外に置いて `form="id"` だけで結んでいる場合は `false` のまま＝ 従来どおり）。
   *   実測 2026-08-17: `files-manager` と `new-folder-form` は**どちらもフォームの中**。
   * 🚨 囲っているフォームと `form` が指す先が違う場合、**囲っている側の状態を見る**。
   *   いまその形は無いが、増やすときは注意すること。
   */
  const formStatus = useFormStatus();
  const busy = pending || formStatus.pending;

  /**
   * 主ボタンの脇に出す **⌘Enter**（2026-08-17）。
   *
   * 【測った・司令塔】`shortcuts.ts` の `save: "mod+enter"` は **18 ルート**で効くのに、
   * `page-action.tsx` に `Kbd` の参照が **0 件**だった
   * ＝ 🚨 **効くのに、利用者がそれを知る手段が無い**（今日 3 つ目の「持っているのに触れない」）。
   *
   * 🚨 **出す条件を、効く条件と同じにする。** 下の `useShortcut` は
   *   `!form || role !== "primary"` で降りるので、**ここも同じ条件で出す**。
   *   ずらすと **効かない鍵を見せる**ことになり、いまの問題の裏返しになる。
   *
   * 🚨 **記号は辞書に持たせない**（`global-search.tsx:120` と同じ理由——
   *   **環境で変わる**。mac は ⌘Enter / それ以外は Ctrl+Enter）。
   */
  const isMac = useIsMac();
  const shortcutHint = form && role === "primary" ? formatShortcut(SHORTCUTS.save, isMac) : null;

  // 🚨 **確認待ちの項目は、メニューの外で持つ**（`confirm-dialog.tsx` の申し送り）。
  //    🚨 そして **ダイアログは 1 つだけ描く**——`renderAction` は PC 用と SP 用で
  //    **2 回呼ばれる**ので、あちらに置くと**同じダイアログが 2 つ開く**。
  const [confirming, setConfirming] = useState<ActionOption | null>(null);
  const runOption = (option: ActionOption) => {
    if (option.formId) {
      submitFormById(option.formId);
      return;
    }
    option.onSelect?.();
  };

  const variant = destructive ? "destructive" : role === "secondary" ? "outline" : "default";
  // 🚨 補助は**必ず主要の左**に出す。portal は mount の順に並ぶので、
  //    ページが補助を先に描くか後に描くかで左右が入れ替わってしまう。
  //    順番をページに委ねず、ここで決める。
  const order = role === "secondary" ? "order-first" : undefined;

  useShortcut(
    SHORTCUTS.save,
    () => {
      // 🚨 `disabled` はボタンだけでなく**ここでも**見る。見ないと、押せないボタンの
      //    ぶんまで ⌘S が送ってしまい、「画面では止まっているのに保存される」ことになる。
      if (!form || role !== "primary" || busy || disabled) return;

      const target = document.getElementById(form);
      if (!(target instanceof HTMLFormElement)) return;

      // 実測 2026-08-15: ブラウザで要求の本数を数えて確認済み（見た目では判定していない）。
      // 項目のフォームに焦点→保存で POST /admin/actions/items/... が1本。
      // 検索ダイアログに焦点→0本（ガード①）。右パネルの報告フォームに焦点→0本（ガード②）。
      // 🚨 ガード②のときダイアログは開いていない。PC の右パネルはダイアログではないので
      //    ガード①だけでは防げず、両方が要る。
      // 🚨 「正しい側で1本」も対で測る。ガードだけ見ると、何も起きない実装でも0本で緑に見える。

      // 開いているダイアログがあるなら、その中の話。裏のページを保存しない。
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;

      // PC の右パネルはダイアログではない。別フォームに焦点があればそちらを優先する。
      const active = document.activeElement;
      const activeForm = active instanceof Element ? active.closest("form") : null;
      if (activeForm && activeForm !== target) return;

      target.requestSubmit();
    },
    { whileTyping: true },
  );

  // PC: ヘッダー右。SP: 下部ナビの3つ目の領域。どちらも文字を見せる。
  const pc = renderAction({
    href,
    form,
    onClick,
    label,
    icon,
    pending: busy,
    disabled,
    variant,
    // 🚨 **アクションは横幅をしっかり取る**（堀池・2026-08-17・L1「アクションはちゃんと横幅をかくほ」
    //    ＋ 画像で「アクション」が黒い塊として広く描かれている）。
    //    【測った】直す前の主操作の幅は **156px**（主ボタン 124 + ▾ 32）。
    //    🚨 `min-w` にする（`w-` にしない）——**文言が長い画面で切れる**ため。
    order: cn(order, "hidden md:inline-flex md:min-w-40 md:justify-center"),
    compact: false,
    options,
    optionsLabel: t("action_options"),
    onConfirmRequest: setConfirming,
    shortcutHint,
    disabledReason,
  });
  const sp = renderAction({
    href, form, onClick, label, icon, pending: busy, disabled, variant, order, compact: true,
    options, optionsLabel: t("action_options"), onConfirmRequest: setConfirming,
    // 🚨 SP には出さない。**下部ナビの 3 つ目**に入るもので、幅が無い
    //    （`header-back.tsx` / `global-search.tsx` も `hidden md:inline-flex` で PC だけに出している）。
    shortcutHint: null,
    disabledReason,
  });

  return (
    <>
      {headerSlot ? createPortal(pc, headerSlot) : null}
      {mobileSlot ? createPortal(sp, mobileSlot) : null}
      {/* 🚨 portal の外に 1 つだけ。Radix が body へ出すので、置き場所は問わない。 */}
      <ConfirmDialog
        spec={confirming?.confirm ?? null}
        onClose={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming) runOption(confirming);
        }}
      />
    </>
  );
}

/** portal の行き先。無ければ null（サーバでは常に null）。 */
function useSlot(id: string): HTMLElement | null {
  return useSyncExternalStore(
    // 枠はレイアウトが常に置いているので、購読して変化を待つ必要はない
    () => () => {},
    () => document.getElementById(id),
    () => null,
  );
}

function renderAction({
  href,
  form,
  onClick,
  label,
  icon,
  pending,
  disabled,
  variant,
  order,
  compact,
  options,
  optionsLabel,
  onConfirmRequest,
  shortcutHint,
  disabledReason,
}: {
  href?: string;
  form?: string;
  onClick?: () => void;
  label: string;
  icon: ReactNode;
  pending: boolean;
  disabled: boolean;
  variant: "default" | "outline" | "destructive";
  order?: string;
  compact: boolean;
  options?: ActionOption[];
  optionsLabel: string;
  /** 確認が要る項目を押したときに、呼び出し元へ知らせる（ダイアログは呼び出し元が 1 つだけ描く）。 */
  onConfirmRequest: (option: ActionOption) => void;
  /** 主ボタンの脇に出す鍵（`⌘Enter`）。**出さないときは `null`**。 */
  shortcutHint: string | null;
  disabledReason?: string;
}) {
  const size = "sm";
  // 🚨 SP だけ 11px にする（PC のヘッダは触らない。同じ部品から出ているため）。
  //    堀池の指示（2026-08-15）は「SPのNAVのタイトル…はもっと小さく。ボタンはSPでは3つ表示」で、
  //    セレクタはナビのリンクを指していた＝**字義通りにはこのボタンを含まない**。
  //    それでも揃えたのは、**堀池が3つを「ボタン」と同列に呼んでいる**ため（依頼側の判断）。
  //    揃えないと、並んだ3つのうち1つだけ 12px になる。
  //    経緯は `docs/research/ja-en-ui-evidence.md` の例外の段落に集約してある。
  const text = <span className={cn(compact && "min-w-0 truncate text-[11px]")}>{label}</span>;
  // 🚨 ▾ と組にすると `w-full` では収まらない（群の中では **`flex-1`** で縮ませる）。
  const compactClassName = compact
    ? cn("min-w-0 overflow-hidden px-1", options?.length ? "flex-1" : "w-full")
    : undefined;

  const 主 = (() => {
  if (href) {
    // 🚨 リンクに `loading` は無い（押した先で画面が変わるだけなので二重送信が起きない）。
    // 🚨 `disabled` も同じく効かない。**行き先があるなら押せないという状態は無い**ので、
    //    リンクに `disabled` を渡す設計にしない（渡しても黙って無視される、を避けるための申し送り）。
    return (
      <Link
        href={href}
        className={cn(buttonVariants({ variant, size }), order, compactClassName)}
      >
        {icon}
        {text}
      </Link>
    );
  }

  return (
    <Button
      // 🚨 `form` を渡すときは **`type="submit"`**。既定の `type` は `button` なので、
      //    付け忘れると**押しても何も起きない**（一番気づきにくい壊れ方）。
      type={form ? "submit" : "button"}
      form={form}
      onClick={onClick}
      variant={variant}
      size={size}
      loading={pending}
      disabled={disabled}
      className={cn(order, compactClassName)}
    >
      {icon}
      {text}
    </Button>
  );
  })();

  // 🚨 **ショートカットはバッジで出さない。ツールチップで見せる**
  //    （堀池・2026-08-17・Y1「ショートカットバッジは窮屈なので、すべて廃止。
  //      代わりにツールチップにする」＋ 画像: 保存ボタンの中に ⌘↵ が入って窮屈）。
  //    🚨 これは **L1（30 分前）の「ショートカットキーも表示しながら」の反転**。
  //      実物を見ての判断で、前の指示が誤りだったのではない。**経緯を消さない。**
  //    🚨 **出す条件は変えていない**（`form && role === "primary"` のときだけ）。
  //      ずらすと**効かない鍵を見せる**ことになる。
  // 🚨 名前を ASCII にしてある。日本語の識別子を **JSX の位置**（三項の分岐など）に置くと、
  //    `check-i18n-hardcoded` が**画面に出る文字と読み違えて落ちる**（実測 2026-08-17）。
  //    既存の `主` は代入の右辺にしか出ないので通っている。
  //    🚨 三項ではなく `let` + `if` で書く。三項の分岐の位置に日本語の識別子が出ると、
  //      同じ検査が **`) : 主;` を画面の文字と読んで落ちる**（実測 2026-08-17・2 回踏んだ）。
  let mainWithTooltip = 主;
  if (shortcutHint) {
    mainWithTooltip = (
      <Tooltip>
        <TooltipTrigger asChild>{主}</TooltipTrigger>
        <TooltipContent side="bottom">{shortcutHint}</TooltipContent>
      </Tooltip>
    );
  }

  if (disabled && disabledReason) {
    mainWithTooltip = (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex">
            {mainWithTooltip}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">{disabledReason}</TooltipContent>
      </Tooltip>
    );
  }

  if (!options?.length) return mainWithTooltip;

  // 🚨 ▾ は **`Button`** で作る（素の <button> にしない）。
  //    規約 §1: base の `active:not-aria-[haspopup]:translate-y-px` を継承するため。
  //    ただし引き金は `aria-haspopup` を持つので、**この 1 本だけ沈まない**（意図された除外）。
  // 🚨 大きさは `icon-sm`。SP では `size-(--control-h)` ＝ **44px**（規約の受入）。
  // 🚨 角の丸めは `ButtonGroup` が持つ（自分で rounded-l-none を書かない。2 箇所に散る）。
  return (
    // 🚨 SP では **`w-full`**（`ButtonGroup` の既定は `w-fit` ＝ 中身の幅。**画面からはみ出す**）。
    //    実測 2026-08-16: 幅 390 の画面で ▾ が **x=404**（＝画面の外）にあり、
    //    `elementFromPoint` が **null** を返した。**開かないのではなく、届かなかった**。
    //    → 群は `w-full`、主ボタンは `flex-1 min-w-0` で縮ませ、▾ は `shrink-0` で 44px を守る。
    <ButtonGroup className={cn(order, compact && "w-full min-w-0")}>
      {mainWithTooltip}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant={variant} size="icon-sm" disabled={disabled} className="shrink-0">
            <span className="sr-only">{optionsLabel}</span>
            <ChevronDownIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        {/* 🚨 **幅を引き金から切り離す**（堀池・2026-08-17・N1「このように文字が縦長になるのも最悪」）。
            【測った 2026-08-17・PC 1280】主要 5 ルートの開くメニューを全部開いて数えた:
              縦長 … **2 件**（どちらもここ。PC 用と SP 用の複製）幅 **32 / 8** ・項目が **7 行**
              🟢 対照 … 他のメニューは幅 176〜239 で項目は 1 行（36px）＝ **ここだけ**
            原因は共有部品 `ui/dropdown-menu.tsx` の `w-(--radix-dropdown-menu-trigger-width)`
            ＝ **メニューが引き金の幅を継ぐ**。引き金が ▾（`icon-sm` = 32px）なので潰れる。
            🚨 **共有部品側は直さない。** あれは「入力と同じ幅にしたい」選択肢のための書き方で、
              変えると**全メニューの幅が一斉に変わる**（実測で他は正常に出ている）。
              **狭い引き金を持つのはここだけ**なので、ここで上書きする。 */}
        <DropdownMenuContent align="end" className="w-auto min-w-44">
          {options.map((o) =>
            o.href ? (
              // 🚨 行き先が在るなら**本物のリンク**にする（Cmd+クリックで新しいタブに開ける）。
              //    2026-08-15 にパンくずで同じ直しをしている。
              <DropdownMenuItem key={o.label} variant={o.destructive ? "destructive" : "default"} asChild>
                <Link href={o.href}>{o.label}</Link>
              </DropdownMenuItem>
            ) : o.confirm ? (
              // 🚨 確認が要る項目。**ここでは送らない**——呼び出し元へ知らせて、
              //    メニューが閉じたあとにダイアログを出す（`confirm-dialog.tsx` の申し送り）。
              //    🚨 `<button type="submit" form=…>` にしない: **押した瞬間に送ってしまう**。
              <DropdownMenuItem
                key={o.label}
                variant={o.destructive ? "destructive" : "default"}
                onSelect={() => onConfirmRequest(o)}
              >
                {o.label}
              </DropdownMenuItem>
            ) : o.formId ? (
              // 🚨 `type="submit"` を忘れると**押しても何も起きない**（既定は button）。
              //    `button.tsx` の申し送りと同じ罠。
              <DropdownMenuItem key={o.label} variant={o.destructive ? "destructive" : "default"} asChild>
                <button
                  type="submit"
                  form={o.formId}
                  name={o.submitName}
                  value={o.submitValue}
                  className="w-full text-left"
                >
                  {o.label}
                </button>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                key={o.label}
                variant={o.destructive ? "destructive" : "default"}
                onSelect={o.onSelect}
              >
                {o.label}
              </DropdownMenuItem>
            ),
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}
