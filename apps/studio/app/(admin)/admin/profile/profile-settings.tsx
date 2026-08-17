"use client";

import * as React from "react";
import { Check, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { AvatarEmojiGrid } from "@/components/admin/avatar-emoji-picker";
import { PageAction } from "@/components/admin/page-action";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Surface, SurfaceDivider, SurfaceTitle } from "@/components/ui/surface";
import { toast } from "@/components/ui/toast";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { setLocaleAction } from "@/i18n/actions";
import { isLocale, LOCALES, type Locale } from "@/i18n/config";
import { useLocale, useT } from "@/i18n/client";

type Props = {
  avatarEmoji: string;
  firstName: string | null;
  lastName: string | null;
};

// directus_users.first_name / last_name の実際の列定義（app/api/auth/me/route.ts の
// NAME_MAX_LENGTH と同じ値。あちらは import できない private const なので、
// クライアント側の早期警告用にここでも同じ値を持つ。判断の最終権限はサーバ側のまま
// （AGENTS.md §3.5）— これは「先に気付かせる」ためだけの控え。
const NAME_PART_MAX_LENGTH = 50;

/**
 * 姓名を1つの入力欄にまとめるための分割ロジック。
 *
 * 🚨 なぜ1つの欄か（idea.md L87 原文）:
 * 「名前は姓名で分けない。モダンな考え方をする。…具体的には姓名はスペースがあればいい。
 *   半角・全角でも、スペースがあれば姓名で分けれる。また近年のAutoFillはそのまま入力できた方がいい。」
 * ブラウザの AutoFill は「氏名」を1つの欄として埋めてくる。姓名を分けた2欄では
 * その値をそのまま流し込めない。
 *
 * 分割ルール（決めた仕様。ここに書いて残す）:
 *   1. 前後の空白（半角スペース・全角スペース U+3000）を trim する。
 *   2. 残った文字列の中で「最初に現れた空白の連続（半角/全角どちらでも）」の位置で二分する。
 *      2つめ以降の空白はそのまま後半の一部として残る（例:「山田 太郎 二郎」→ 後半は「太郎 二郎」）。
 *   3. 空白が1つも無ければ、値は全部 firstName に入れ、lastName は空にする
 *      （一語だけの名前を拒否しない）。
 *
 * 姓が前か名が前かは locale で決まる。`lib/admin/user-label.ts` の `displayUserName` と
 * 同じ並び順に合わせている（あちらは表示専用で MeResult 型を受け取る関数なので、
 * 同じ規則をここへ再実装している。1本のSoTにできていない点は認識した上でのトレードオフ）:
 *   - ja: 先頭が姓 → lastName = 前半, firstName = 後半
 *   - それ以外（en）: 先頭が名 → firstName = 前半, lastName = 後半
 *
 * 🚨 既知の限界: ja のまま英語名（例 "Kazuma Horiike"）を入れた人は、
 * 前半を姓として解釈してしまう（姓=Kazuma, 名=Horiike という取り違え）。
 * 「スペースで区切る」ルールである以上、区切られた各語がどちらの意味を持つかは
 * 推測にしかならず、これは避けられない。見落としではなく、そう決めた上での仕様。
 */
export function splitDisplayName(
  value: string,
  locale: Locale,
): { firstName: string; lastName: string } {
  const trimmed = value.trim();
  const match = trimmed.match(/[ 　]+/);

  if (!match || match.index === undefined) {
    return { firstName: trimmed, lastName: "" };
  }

  const before = trimmed.slice(0, match.index);
  const after = trimmed.slice(match.index + match[0].length);

  return locale === "ja"
    ? { lastName: before, firstName: after }
    : { firstName: before, lastName: after };
}

/**
 * splitDisplayName の逆変換。保存済みの firstName/lastName から入力欄の初期値を組み立てる。
 * 🚨 編集せずに保存しても値が変わらないよう、locale の並び順を splitDisplayName と揃える。
 */
export function composeDisplayName(
  firstName: string | null,
  lastName: string | null,
  locale: Locale,
): string {
  const first = firstName?.trim() || "";
  const last = lastName?.trim() || "";

  if (!first && !last) return "";
  if (!first) return last;
  if (!last) return first;

  return locale === "ja" ? `${last} ${first}` : `${first} ${last}`;
}

/**
 * 保存ボタンを押した時点で、入力欄の値が初期表示（composeDisplayName の結果）から
 * 変わっているかどうかを判定する。
 *
 * 🚨 なぜ必要か: 姓しか無い利用者（firstName=null）の初期値は空白を含まない1語になる
 * （例: 「堀池」）。無編集のまま保存すると splitDisplayName が「空白なし→全部 firstName」
 * のルールで解釈し、姓が名に化けてしまう（姓が消える事故）。編集していないと分かれば
 * そもそも分割・送信をしない、が一番安全。
 *
 * 🚨 生の文字列同士をそのまま比較する（trim や空白の正規化をしない。**守り手: 無し＝願望**）。正規化してから
 * 比べると、「空白の増減だけの編集」が「無編集」に見えてしまい、変更が送信されず消える。
 */
export function hasNameChanged(
  rawValue: string,
  firstName: string | null,
  lastName: string | null,
  locale: Locale,
): boolean {
  return rawValue !== composeDisplayName(firstName, lastName, locale);
}

export function ProfileSettings({ avatarEmoji, firstName, lastName }: Props) {
  const t = useT("nav");
  const tCommon = useT("common");
  const locale = useLocale();
  const router = useRouter();
  const localeInFlightRef = React.useRef(false);
  const [localePending, startLocaleTransition] = React.useTransition();
  const [selectedLocale, setSelectedLocale] = React.useState<Locale>(locale);
  // 🚨 入力の不足・上限超過は欄の近くに出す（トーストにしない。消えると直せなくなる。
  //    knowledge/decisions/toast-for-events-page-for-what-needs-fixing.md と同じ考え方）。
  const [nameError, setNameError] = React.useState<string | null>(null);
  /**
   * 🚨 **表示モードと編集モードを分ける**（堀池さん 2026-08-15・原文）:
   * 「`/admin/profile` などでは「名前を保存」としているが、**それは廃止**。
   *  アクションボタンで「編集する」を押下する。**全てにおいて基本は編集モードと表示を分ける**」
   * 規約: `knowledge/decisions/action-button-and-edit-mode.md`
   *
   * 🚨 境目は「**保存されていない変更を持ちうるか**」（規約 §2）。
   *    表示モードでは欄を `readOnly` にする（`disabled` にしない。
   *    **読めるが変えられない**が規約の言葉で、`disabled` は読み上げからも外れる）。
   */
  const [editing, setEditing] = React.useState(false);
  const nameInputRef = React.useRef<HTMLInputElement>(null);
  /**
   * 🚨 「やめる」で**入れた値を捨てる**ための鍵。増やすと `<form>` が作り直され、
   * `defaultValue` が引き直される（欄は uncontrolled なので、これをしないと値が残る）。
   *
   * 2026-08-16 実測（3/3 再現）で分かった不具合の修正:
   * ```
   * 「編集する」→ 欄に入力 → 「やめる」
   *   直っていなかったとき … 表示モードに戻っても **入れた値が画面に出たまま**
   *                          （readOnly=true / 値="ZZ 破棄テスト"）
   *   ＝ 🚨 **表示モードが、保存されていない値を「保存済みの値」として見せていた**
   *   さらに「編集する」を押し直すと、捨てたはずの値が**生き返る**
   * ```
   * 🚨 これは「やめる」を置いた意味そのものを壊す（規約 §4「変更を捨てたい人」のため）。
   * 🚨 同じ形は **uncontrolled な欄を持つ全画面**で起きる。C の 6 枚へ写す前にここで直した。
   */
  const [formKey, setFormKey] = React.useState(0);
  /** 編集をやめて表示モードへ戻す。**入れた値は捨てる**（上記）。 */
  const cancelEditing = React.useCallback(() => {
    setNameError(null);
    setEditing(false);
    setFormKey((k) => k + 1);
  }, []);

  const saveName = useSubmitOnce(async (form: HTMLFormElement) => {
    const formData = new FormData(form);
    const rawName = String(formData.get("name") ?? "");

    // 🚨 無編集の保存で姓が名へ移る事故を防ぐ。API は省いたキーを
    //    触らないので、変わっていないなら送らないのが一番安全。
    const nameChanged = hasNameChanged(rawName, firstName, lastName, locale);
    let body: Record<string, string> = {};

    if (nameChanged) {
      const { firstName: nextFirstName, lastName: nextLastName } = splitDisplayName(
        rawName,
        locale,
      );

      // 🚨 分割した結果は、利用者からは総文字数しか見えない（1つの欄なので）。
      //    サーバは firstName/lastName をそれぞれ50文字までしか受けないので、
      //    送る前にここで見て、どちらが超えたかに関わらず欄の近くに知らせる。
      //    maxLength 属性では防げない（分割は入力後に行うため）。
      if (
        nextFirstName.length > NAME_PART_MAX_LENGTH ||
        nextLastName.length > NAME_PART_MAX_LENGTH
      ) {
        setNameError(t("profile_name_too_long"));
        return;
      }
      body = { firstName: nextFirstName, lastName: nextLastName };
    }
    setNameError(null);

    // 🚨 **変わっていないなら、そもそも送らない。**
    //    以前は body = {} のまま PATCH していた。サーバは省いたキーを触らないので
    //    害は無いが、**押すたびに無駄な往復が1本増える**。
    //    保存ボタンをヘッダへ出した（497209f）ので押される回数が増え、悪化していた。
    //    🚨 トーストは出す。押して何も起きないのは不親切で、しかも
    //    **「保存されている内容と、いま見えている内容が一致している」は事実**なので嘘にならない。
    if (!nameChanged) {
      toast.success(t("profile_name_saved"));
      setEditing(false);
      return;
    }

    const response = await fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      // 🚨 コードで出し分ける。以前は失敗を全部同じトーストへ畳んでいて、
      //    「長すぎて弾かれた」のか「リクエスト自体が失敗した」のか区別が付かなかった。
      const payload = (await response.json().catch(() => null)) as
        | { error?: { code?: string } }
        | null;
      if (payload?.error?.code === "INVALID_NAME") {
        setNameError(t("profile_name_too_long"));
      } else {
        toast.error(t("profile_name_error"));
      }
      return;
    }

    setNameError(null);
    toast.success(t("profile_name_saved"));
    setEditing(false);
    router.refresh();
  });

  function handleNameSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveName.run(event.currentTarget);
  }

  function handleLocaleChange(value: string) {
    if (!isLocale(value) || value === selectedLocale || localeInFlightRef.current) return;
    localeInFlightRef.current = true;
    setSelectedLocale(value);
    const formData = new FormData();
    formData.set("locale", value);
    startLocaleTransition(async () => {
      try {
        await setLocaleAction(formData);
      } finally {
        localeInFlightRef.current = false;
      }
    });
  }

  return (
    <Surface>
      <section className="flex min-w-0 flex-col gap-3" aria-labelledby="profile-icon-title">
        <SurfaceTitle id="profile-icon-title">{t("profile_icon_section")}</SurfaceTitle>
        <AvatarEmojiGrid current={avatarEmoji} />
      </section>

      <SurfaceDivider />

      <section className="flex min-w-0 flex-col gap-3" aria-labelledby="profile-name-title">
        <SurfaceTitle id="profile-name-title">{t("profile_name_section")}</SurfaceTitle>
        <form
          // 🚨 `key` を増やすと作り直され、`defaultValue` が引き直される（「やめる」の実体）
          key={formKey}
          id="profile-name-form"
          onSubmit={handleNameSubmit}
          // 🚨 PC で横に伸びきらないよう上限を置く（2026-08-15 実測 736px → 違反）。
          //    堀池さん（原文）:「全てのセクション・要素は PC の場合横長になりすぎる。
          //    理由として**そのフィールドの目的や全体のバランスが見れてない**のが原因」
          //    名前は長くても数十文字なので、736px は目的に対して広すぎる。
          //    値は settings-manager.tsx:132 と同じ max-w-2xl に揃えた（新しい幅を発明しない）。
          //    守り手: `scripts/audit-surface-depth.mjs` の §3 入力が横に長すぎる（720px 超で落ちる）。
          className="flex min-w-0 max-w-2xl flex-col gap-4"
        >
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="profile-name">{t("profile_name_label")}</Label>
            {/* 🚨 幅は **`lib/schema/interfaces.ts` の `fieldWidthClass()` の段**に合わせる（16-1）。
                氏名は姓・名それぞれ 50 文字が上限（`NAME_PART_MAX_LENGTH`）＝ **60 文字以下の文字列**の段。
                🚨 **新しい数字を作らない。** 段は 160 / 240 / 448 / 672 の 4 つだけ。
                🚨 包むのは**操作部品だけ**（`item-form.tsx:101` と同じ形。ラベルまで狭めない）。
                🚨 `md:` なので **SP は器いっぱいのまま**（実測 358px）。 */}
            <div className="md:max-w-md">
            <Input
              id="profile-name"
              name="name"
              ref={nameInputRef}
              autoComplete="name"
              // 🚨 表示モードは `readOnly`。`disabled` にしない
              //    （規約 §2「読めるが変えられない」。`disabled` だと読み上げから外れ、
              //     値をコピーすることもできなくなる）
              readOnly={!editing}
              onChange={() => setNameError(null)}
              aria-invalid={nameError !== null || undefined}
              placeholder={!editing ? tCommon("not_set") : undefined}
              defaultValue={composeDisplayName(firstName, lastName, locale)}
            />
            </div>
            {nameError !== null ? (
              <p className="text-sm text-destructive">{nameError}</p>
            ) : null}
          </div>
          {/* 🚨 **主ボタンはモードで変わる**（規約 §2）。固定の「名前を保存」は**廃止**した
              （鍵 `nav.profile_name_save` も消してある。移すのではなく廃止がご指示）。 */}
          {editing ? (
            <>
              {/* 🚨 抜け道は **▾ の中ではなく主ボタンの隣**（規約 §4）。
                  隠すと、変更を捨てたい人が保存してしまう。
                  `role="secondary"` は部品が**必ず主の左**へ出す（描く順に依らない）。
                  ⚠️ これでボタンが 2 つ並ぶ。ご指示は「一つのボタン＋chevron」なので、
                     司令塔がユーザーへ確認中。**▾ の中へ移すなら 1 行で移せる形にしてある**。 */}
              <PageAction
                role="secondary"
                label={tCommon("action_cancel")}
                icon={<X />}
                onClick={cancelEditing}
              />
              <PageAction
                form="profile-name-form"
                label={tCommon("action_save")}
                icon={<Check />}
                pending={saveName.pending}
              />
            </>
          ) : (
            <PageAction
              label={tCommon("action_edit")}
              icon={<Pencil />}
              onClick={() => {
                setEditing(true);
                // 🚨 押した直後に欄へ焦点を移す。移さないと、キーボードだけの人は
                //    「編集する」を押したあと自分で欄まで辿ることになる。
                requestAnimationFrame(() => nameInputRef.current?.focus());
              }}
            />
          )}
        </form>
      </section>

      <SurfaceDivider />

      {/*
        🚨 **即時に効くので、編集モードの外**（design 2026-08-16 決定）。
           表示モードでも編集モードでも、**常にそのまま押せる**（灰色にしない・消さない）。
           🚨 **モードで見た目を変えない**（design 指定の言い回し）。
        理由: 選んだ瞬間に反映され、**保存ボタンを押さない** ＝
           「確定するまで待つ」状態がそもそも無い（規約 §5-0 の軸）。
           右パネルの表示設定と同じ扱い。
        🚨 **これは §7 の「例外」ではない。最初から対象ではない**
           （287 B の「例外なし」は生きたまま）。
        🚨 **「編集する」を押していない人が言語を変えられなくなる、が最悪の形。**
           言語は「設定を直す」ではなく「いま見ている画面の言葉を変える」操作なので。
        🚨 この注記を消さないこと。消すと、棚卸しのたびに「直し忘れ」として拾われる
           （2026-08-16 に実際そう読まれかけた。`[role=combobox]` で探すと出てくる）。
      */}
      <section className="flex min-w-0 flex-col gap-3" aria-labelledby="profile-language-title">
        <SurfaceTitle id="profile-language-title">{t("profile_language_section")}</SurfaceTitle>
        <form action={setLocaleAction}>
          <input type="hidden" name="locale" value={selectedLocale} readOnly />
          <Select
            value={selectedLocale}
            onValueChange={handleLocaleChange}
            disabled={localePending}
          >
            <SelectTrigger
              id="profile-locale"
              aria-labelledby="profile-language-title"
              className="w-full max-w-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {LOCALES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {tCommon(`locale_${item}`)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </form>
      </section>
    </Surface>
  );
}
