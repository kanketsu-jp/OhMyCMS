"use client";

import { usePathname } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { FormDraft } from "@/components/admin/form-draft";
import { SHORTCUTS } from "@/components/admin/shortcuts";
import { useShortcut } from "@/components/admin/use-shortcut";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useLocale, useT } from "@/i18n/client";
import { errorKeyFromApiCode } from "@/i18n/error";

type Props = {
  /** 送り終わったら呼ぶ。右サイドバーなら 1 つ前へ戻す用 */
  onDone?: () => void;
};

/**
 * 不具合の報告を書くところ（チャットの 1 通目）。
 *
 * 堀池さん（2026-08-15 原文）:
 * > 「報告する時は、そのページのパスなどがメタ情報として入る。**5W1H を担保する**。
 * >   報告自体は入力しやすいように、**自動で取得できる情報以外**の内容などを入れさせる。」
 *
 * → **人に書かせるのは 3 つだけ**（件名 / 何が起きたか / 本来どうなるはずだったか）。
 *   Who・When・Where は自動で埋まる。
 *
 * 🚨 **自動で集めるものを増やさない。**（守り手: `scripts/check-report-body-keys.mjs`。
 *    画面が送る鍵が `validate()` の読む範囲を超えたら落ちる。
 *    🚨 **見ていない範囲**: ①**この 1 経路だけ**（他のフォームの送信は見ていない）
 *    ②`fetch` の本文を**別の関数へ切り出す**と `JSON.stringify({…})` を見つけられない）送るのは
 *   「開いている画面のパス」「画面の大きさ」「表示言語」だけ。
 *   Cookie・トークン・設定値は送らない。**動いている版はサーバが入れる**
 *   （画面から名乗らせない ＝ 報告を読む側が信じられる値にする）。
 *   何が自動で付くかを画面に**書いてある**のは、本文に秘密を書かせないためでもある。
 *
 * 🚨 **画面の中に結果を出さない**（司令塔 2026-08-15「出来事はトースト、状態はページ」）。
 *   送信の完了は「起きて終わったこと」なのでトースト。入力の不足は
 *   「まだ直す必要があること」なので、その場に出す。
 *   決定: knowledge/decisions/toast-for-events-page-for-what-needs-fixing.md
 */
export function BugReportComposer({ onDone }: Props) {
  const t = useT("reports");
  const tError = useT("errors");
  const locale = useLocale();
  const pathname = usePathname();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [expected, setExpected] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  // 🚨 入力の不足は**その欄の近く**に出す（消えると直せなくなるのでトーストにしない）。
  const [fieldError, setFieldError] = useState<"title" | "body" | null>(null);

  // 画面の大きさはサーバでは分からないので、水和のあとに読む。
  //
  // 🚨 `useEffect` の中で `setState` する形にしない。React Compiler の lint が
  //    `react-hooks/set-state-in-effect` で **error にする**（実際に落ちた）。
  //    `page-action.tsx` が同じ理由で `useSyncExternalStore` を使っているので揃える。
  // 🚨 返すのは文字列（プリミティブ）なので、同じ大きさなら同じ値になり再描画が続かない。
  const viewport = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("resize", onChange);
      return () => window.removeEventListener("resize", onChange);
    },
    () => `${window.innerWidth}x${window.innerHeight}`,
    () => null,
  );

  const submit = useSubmitOnce(async () => {
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle) {
      setFieldError("title");
      return;
    }
    if (!trimmedBody) {
      setFieldError("body");
      return;
    }
    setFieldError(null);

    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: trimmedTitle,
        body: trimmedBody,
        expected: expected.trim() || undefined,
        page_path: pathname,
        viewport,
        locale,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { code?: string } }
        | null;
      // API の生文言をそのまま画面へ出さない。細工した応答で任意の文章を公式のエラー枠に出せるため。code を鍵へ写して辞書から出す。
      const key = errorKeyFromApiCode(payload?.error?.code);
      // 🚨 code が分からない（unexpected に落ちた）ときは、この画面固有の文言のほうが具体的。
      //    分かるときは辞書の訳を出す。どちらの経路でも API の生文言は出さない。
      toast.error(key === "unexpected" ? t("error_submit_failed") : tError(key));
      return;
    }

    const payload = (await response.json().catch(() => null)) as
      | { data?: { mail_status?: "skipped" | "sent" | "failed" } }
      | null;
    const mail = payload?.data?.mail_status ?? "skipped";

    // 受け付けたことが本体。メールの可否は補足なので説明にまわす。
    // 🚨 **メール未設定は失敗ではない**ので、失敗のトーストにしない。
    toast.success(t("submitted"), {
      description:
        mail === "sent"
          ? t("mail_sent")
          : mail === "failed"
            ? t("mail_failed")
            : t("mail_skipped"),
    });

    setTitle("");
    setBody("");
    setExpected("");
    onDone?.();
  });

  useShortcut(
    SHORTCUTS.submit,
    () => {
      // useShortcut は document に付くので、同じ組み合わせを持つ部品が
      // 2つ載っていると両方動く。いま入力している欄のフォームだけ送る。
      if (!formRef.current?.contains(document.activeElement)) return;
      void submit.run();
    },
    { whileTyping: true },
  );

  return (
    <form
      ref={formRef}
      id="bug-report-form"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit.run();
      }}
    >
      <FormDraft formId="bug-report-form" />
      <div className="grid gap-2">
        <Label htmlFor="report-title">{t("report_title_label")}</Label>
        <Input
          id="report-title"
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t("report_title_placeholder")}
          maxLength={255}
          aria-invalid={fieldError === "title" || undefined}
        />
        {fieldError === "title" ? (
          <p className="text-sm text-destructive">{t("error_title_required")}</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="report-body">{t("report_body_label")}</Label>
        <Textarea
          id="report-body"
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={6}
          maxLength={20000}
          placeholder={t("report_body_placeholder")}
          aria-invalid={fieldError === "body" || undefined}
        />
        {fieldError === "body" ? (
          <p className="text-sm text-destructive">{t("error_body_required")}</p>
        ) : null}
      </div>

      {/* 5W1H の Why。**必須にしない**（書けない場面があるし、無くても報告は成立する）。 */}
      <div className="grid gap-2">
        <Label htmlFor="report-expected">{t("report_expected_label")}</Label>
        <Textarea
          id="report-expected"
          name="expected"
          value={expected}
          onChange={(event) => setExpected(event.target.value)}
          rows={2}
          maxLength={20000}
          placeholder={t("report_expected_placeholder")}
        />
      </div>

      {/* 🚨 「何が自動で付くか」を**実際の値で**見せる。
          「パスなどを送ります」と書くだけだと、何が送られるか分からないまま送ることになる。 */}
      <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <p>{t("privacy_note")}</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt>{t("meta_page")}</dt>
          <dd className="truncate font-mono">{pathname}</dd>
          <dt>{t("meta_viewport")}</dt>
          <dd className="font-mono">{viewport ?? "—"}</dd>
          <dt>{t("meta_locale")}</dt>
          <dd className="font-mono">{locale}</dd>
        </dl>
      </div>

      <Button type="submit" loading={submit.pending} className="w-full">
        {t("submit_button")}
      </Button>
    </form>
  );
}
