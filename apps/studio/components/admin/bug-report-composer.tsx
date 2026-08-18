"use client";

import { Send, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { ChatComposer, ChatComposerField } from "@/components/admin/chat-composer";
import { FormDraft } from "@/components/admin/form-draft";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useFormat, useLocale, useT } from "@/i18n/client";
import { errorKeyFromPayload } from "@/i18n/error";

type Props = {
  /** 送り終わったら呼ぶ。右サイドバーなら 1 つ前へ戻す用 */
  onDone?: () => void;
};

const MAX_ATTACHMENTS = 5;
const ATTACHMENT_ACCEPT = "image/png,image/jpeg,image/gif,image/webp";

/**
 * 不具合の報告を書くところ（チャットの 1 通目）。
 *
 * 堀池さん（2026-08-15 原文）:
 * > 「報告する時は、そのページのパスなどがメタ情報として入る。**5W1H を担保する**。
 * >   報告自体は入力しやすいように、**自動で取得できる情報以外**の内容などを入れさせる。」
 *
 * → **人に書かせるのは 2 つだけ**（何が起きたか / 本来どうなるはずだったか）。
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
 *
 * 🚨 **通信そのものが失敗したとき**（機内モード・サーバが落ちている）を必ず受ける。
 *    実測 2026-08-17（pages・失敗の道の走査）で、直す前は
 *    **トースト 0 件・その場のエラー 0 件**＝**画面に何も出なかった**
 *    （🟢 対照 403 / 404 / 500 は「権限がありません」「送信できませんでした」が出ていた）。
 *    ＝ **応答が返る失敗だけを見ていて、応答が返らない失敗を見ていなかった。**
 *
 * 🚨 **画像を送る `fetch` を `submit` の外へ出さないこと。**（実測 2026-08-17）
 *    見やすさのために `uploadAttachments()` という関数へ出したら、`check-submit-once` が
 *    **「二重送信の防御がありません（関数 不明）」**にした——**入れ物が `useSubmitOnce` でない**ので、
 *    検査から見ると「素の POST」に見える。正しい。**送信は押した 1 回の中に閉じておく。**
 *    ＝ 中に置いたまま**短く書く**しかない（下の 60 行の話）。
 *
 * 🚨 **落ちた画像は「件数」ではなく「ファイルそのもの」を残す。**
 *    件数だけ持つと、もう一度押したときに**どれを送り直すか分からない**（成功した分も二重に送る）。
 *    記録が済んだ id（`recordedReportId`）を持つのも同じ理由——持たないと**報告が 2 件できる**。
 *
 * 🚨 **`try`/`catch` で囲まず `.catch(() => null)` で受ける。**
 *    `check-submit-once` は `useSubmitOnce(` の行から **60 行** しか遡らずに
 *    入れ物の関数を探す（`scripts/check-submit-once.mjs` の `i - j < 60`）。
 *    ここに説明を 17 行書いたら、下の添付送信が **63 行目**になって窓から出て、
 *    「二重送信の防御がありません（関数 **不明**）」になった（実測 2026-08-17）。
 *    ＝ **検査を緩めるのではなく、長い説明は関数の外（ここ）へ出す。**
 */
export function BugReportComposer({ onDone }: Props) {
  const t = useT("reports");
  const tError = useT("errors");
  const format = useFormat();
  const locale = useLocale();
  const pathname = usePathname();

  const [body, setBody] = useState("");
  const [expected, setExpected] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState(false);
  // 🚨 **記録が済んだ報告の id**。画像だけが送れなかったときに持つ。
  //    これを持たないと、もう一度押したときに**同じ報告がもう 1 件できる**
  //    （＝ 受け取る側は「2 件来た。どちらが本物か」を判断させられる）。
  const [recordedReportId, setRecordedReportId] = useState<string | null>(null);
  // 🚨 入力の不足は**その欄の近く**に出す（消えると直せなくなるのでトーストにしない）。
  const [fieldError, setFieldError] = useState<"body" | null>(null);

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
    const trimmedBody = body.trim();
    if (!trimmedBody) {
      setFieldError("body");
      return;
    }
    setFieldError(null);

    let reportId = recordedReportId;
    let mail: "skipped" | "sent" | "failed" = "skipped";

    // 🚨 **記録が済んでいるなら、報告は作らない**（画像だけ送り直す）。
    if (reportId === null) {
      // 🚨 通信が落ちたときを受ける（理由と実測はこの部品の冒頭）。
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: trimmedBody,
          expected: expected.trim() || undefined,
          page_path: pathname,
          viewport,
          locale,
        }),
      }).catch(() => null);

      // 🚨 本文は消さない（`setBody("")` は成功したときだけ）。そのまま押し直せる。
      if (!response) {
        toast.error(tError("network"));
        return;
      }

      if (!response.ok) {
        // 🚨 API の生文言は画面へ出さない（code を鍵へ写す）。寄せ先は i18n/error.ts の 1 本だけ
        //    （司令塔 2026-08-17: 同じ取り出しが 10 箇所に散っていたのを寄せた）。
        //    表に無い code では `null` が返るので、その場の具体的な文言を使う。
        const key = errorKeyFromPayload(await response.json().catch(() => null));
        toast.error(key === null ? t("error_submit_failed") : tError(key));
        return;
      }

      const payload = (await response.json().catch(() => null)) as
        | { data?: { id?: string; mail_status?: "skipped" | "sent" | "failed" } }
        | null;
      reportId = payload?.data?.id ?? null;
      mail = payload?.data?.mail_status ?? "skipped";
    }

    // 🚨 落ちた**ファイルそのもの**を残す（件数だけだと送り直せない）。理由はこの部品の冒頭。
    const files = attachments;
    const failed: File[] = reportId === null ? [...files] : [];
    for (const file of reportId === null ? [] : files) {
      const formData = new FormData();
      formData.set("file", file);
      const sent = await fetch(`/api/reports/${reportId}/attachments`, {
        method: "POST",
        body: formData,
      }).catch(() => null);
      if (!sent?.ok) failed.push(file);
    }

    if (failed.length > 0 && reportId !== null) {
      // 🚨 **記録は残っている。** だから「送信できませんでした」と言わない。
      //    そして **次に何をすればよいか**を言う（規約 2026-08-17・司令塔:
      //    「直らないものを『もう一度お試しください』と言わない。直らないなら
      //     何をすれば直るかを書く」）。ここは**押し直せば直る**side なので、
      //    「もう一度押すと画像だけ送り直す」と言い切る。
      // 🚨 送れた分は捨てる（`failed` だけ残す）。残さないと二重に送る。
      setRecordedReportId(reportId);
      setAttachments(failed);
      setAttachmentError(false);
      toast.error(t("attach_retry_title"), {
        description: t("attach_retry", {
          total: format.number(files.length),
          failed: format.number(failed.length),
        }),
      });
      return;
    }

    const toastDescription =
      failed.length > 0
        ? t("attach_failed", {
            total: format.number(files.length),
            failed: format.number(failed.length),
          })
        : mail === "sent"
          ? t("mail_sent")
          : mail === "failed"
            ? t("mail_failed")
            : t("mail_skipped");

    // 受け付けたことが本体。メールの可否は補足なので説明にまわす。
    // 🚨 **メール未設定は失敗ではない**ので、失敗のトーストにしない。
    toast.success(t("submitted"), {
      description: toastDescription,
    });

    setBody("");
    setExpected("");
    setAttachments([]);
    setAttachmentError(false);
    setRecordedReportId(null);
    onDone?.();
  });

  function addAttachments(fileList: FileList | null): void {
    const selected = Array.from(fileList ?? []);
    if (selected.length === 0) return;

    setAttachments((current) => {
      const available = MAX_ATTACHMENTS - current.length;
      if (available <= 0) {
        setAttachmentError(true);
        return current;
      }
      const next = [...current, ...selected.slice(0, available)];
      setAttachmentError(selected.length > available);
      return next;
    });
  }

  function removeAttachment(index: number): void {
    setAttachments((current) => current.filter((_, currentIndex) => currentIndex !== index));
    setAttachmentError(false);
  }

  // 🚨 送信のショートカットは付けない（堀池さん 2026-08-17・原文「他の画面とキーが
  // 被ってしまうため、今回は設定なしにしてください」）。他の画面の submit ショートカット定義は残す。

  return (
    <form
      id="bug-report-form"
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit.run();
      }}
    >
      <FormDraft formId="bug-report-form" />
      <ChatComposer
        textareaId="report-body"
        textareaName="body"
        value={body}
        onChange={setBody}
        placeholder={t("report_body_placeholder")}
        submitLabel={recordedReportId === null ? t("submit_button") : t("attach_retry_button")}
        submitIcon={<Send />}
        pending={submit.pending}
        textareaAriaInvalid={fieldError === "body"}
        below={
          <div className="flex flex-col gap-2">
            {fieldError === "body" ? (
              <p className="text-base text-destructive">{t("error_body_required")}</p>
            ) : null}

            {/* 🚨 **黙って動きを変えない。** 記録が済んだあとは、押しても報告は増えず
                画像だけを送り直す。**書き足した本文は反映されない**ので、そこも言う
                （言わないと「直したのに直っていない」になる）。 */}
            {recordedReportId !== null ? (
                <p className="text-base text-muted-foreground">{t("attach_retry_note")}</p>
            ) : null}

            {/* 5W1H の Why。**必須にしない**（書けない場面があるし、無くても報告は成立する）。 */}
            <Accordion>
              <AccordionItem value="expected">
                <AccordionTrigger>{t("expected_accordion_label")}</AccordionTrigger>
                <AccordionContent>
                  <div className="mt-2">
                    <ChatComposerField
                      id="report-expected"
                      name="expected"
                      value={expected}
                      onChange={setExpected}
                      rows={2}
                      placeholder={t("report_expected_placeholder")}
                      ariaLabel={t("expected_accordion_label")}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* 🚨 「何が自動で付くか」を**実際の値で**見せる。
                「パスなどを送ります」と書くだけだと、何が送られるか分からないまま送ることになる。 */}
            <Accordion>
              <AccordionItem value="meta">
                <AccordionTrigger>{t("meta_accordion_label")}</AccordionTrigger>
                <AccordionContent>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    <dt>{t("meta_page")}</dt>
                    <dd className="truncate font-mono">{pathname}</dd>
                    <dt>{t("meta_viewport")}</dt>
                    <dd className="font-mono">{viewport ?? "—"}</dd>
                    <dt>{t("meta_locale")}</dt>
                    <dd className="font-mono">{locale}</dd>
                  </dl>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="grid gap-2">
              <Label htmlFor="report-attachments" className="w-fit cursor-pointer">
                {t("attach_label")}
              </Label>
              <input
                id="report-attachments"
                type="file"
                accept={ATTACHMENT_ACCEPT}
                multiple
                className="sr-only"
                onChange={(event) => {
                  addAttachments(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
              />
              {attachments.length > 0 ? (
                <AttachmentGroup>
                  {attachments.map((file, index) => (
                    <Attachment key={`${file.name}-${file.lastModified}-${index}`} state="idle">
                      <AttachmentContent>
                        <AttachmentTitle>{file.name}</AttachmentTitle>
                        <AttachmentDescription>{format.fileSize(file.size)}</AttachmentDescription>
                      </AttachmentContent>
                      <AttachmentActions>
                        <AttachmentAction
                          type="button"
                          aria-label={t("attach_remove")}
                          onClick={() => removeAttachment(index)}
                        >
                          <X />
                        </AttachmentAction>
                      </AttachmentActions>
                    </Attachment>
                  ))}
                </AttachmentGroup>
              ) : null}
              {attachmentError ? (
                <p className="text-base text-destructive">{t("attach_too_many")}</p>
              ) : null}
            </div>
          </div>
        }
      />
    </form>
  );
}
