"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { FileDropzone } from "@/components/admin/file-dropzone";
import { useSubmitOnce } from "@/hooks/use-submit-once";
import { useLocale, useT } from "@/i18n/client";

type OnboardingFormProps = {
  defaultProjectName: string;
  /** 既定のパスワードのままか。🚨 表示はこの部品が持つ（完了へ切り替えるのもこの部品なので）。 */
  usingDefaultPassword: boolean;
};

export function OnboardingForm({ defaultProjectName, usingDefaultPassword }: OnboardingFormProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useT("onboarding");
  const [step, setStep] = useState<"password" | "details">("password");
  const [projectName, setProjectName] = useState(defaultProjectName);
  const [logoId, setLogoId] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<"form" | "done">("form");

  // 🚨 アップロードも「変更を送る」操作なので useSubmitOnce を通す。
  //    `logoUploading`（useState）では防げない——**setState は非同期**で、
  //    再レンダーが走る前に2回目が通る（憲章 §5b）。
  //    守り手: scripts/check-submit-once.mjs（通していないと落ちる）
  //
  // 🚨 **finally を外さないこと。ただし理由は inFlight ではない。**
  //    以前ここには「早期 return があると inFlight が残り、二度とアップロードできなくなる」と
  //    書いてあったが、**2026-08-15 の実測で成立しなかった**。
  //    下の `submit` は早期 return があり、呼び出し側に finally が無い経路だが、
  //    **3 回押して 3 回とも走った**（門は残らない）。
  //    inFlight を開けているのは**フックの側**（hooks/use-submit-once.ts:68-75 の try/finally）で、
  //    呼び出し側が何をしても通る。＝ **inFlight の守り手は、ここではなくフックにある。**
  //
  //    この finally が守っているのは `logoUploading` のほう。戻し損ねると
  //    送信ボタン（「はじめる」）の `disabled={logoUploading}` が立ったままになり、
  //    **アップロードが失敗したあと「はじめる」が二度と押せず、初期設定を終えられない**。
  //    🚨 こちらには守り手が無い（検査で見ていない）。外すときは自分で確かめること。
  const uploadLogo = useSubmitOnce(async (files: File[]) => {
    const file = files[0];
    if (!file) return;

    setLogoError(null);
    setLogoUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/onboarding/logo", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        setLogoError(t("logo_failed"));
        return;
      }

      const payload = (await response.json()) as { data: { id: string } };
      setLogoId(payload.data.id);
    } finally {
      setLogoUploading(false);
    }
  });

  const submit = useSubmitOnce(async (includeDetails: boolean) => {
    setError(null);

    const response = await fetch(`/api/onboarding`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        new_password: newPassword,
        default_locale: locale,
        ...(includeDetails
          ? {
              project_name: projectName,
              project_logo: logoId ?? "",
            }
          : {}),
      }),
    });

    if (!response.ok) {
      // 🚨 全部を「時間をおいてもう一度」にしない。**400 は何度押しても同じ結果**なので、
      //    その文言は嘘になる（2026-08-15 に実際、tenant_name の 400 に対してこれが出ていた）。
      //    🚨 サーバの生文言は画面に出さない（?error= で任意の文章を出せてしまう形と同じ理由）。
      //    出し分けるのは**状態コードだけ**で、中身は辞書から引く。
      setError(
        response.status === 409
          ? t("failed_conflict")
          : response.status >= 400 && response.status < 500
            ? t("failed_input")
            : t("failed"),
      );
      return;
    }

    // 🚨 /admin へ即座に飛ばさない。同じページの中身を完了の表示に差し替える。
    setStage("done");
  });

  if (stage === "done") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{t("done_title")}</h2>
          <p className="text-sm text-muted-foreground">{t("done_description")}</p>
        </div>
        <ul className="flex flex-col gap-2 text-sm">
          <li>
            <Link
              href="/admin/settings/general"
              // 🚨 下線を持たせない（堀池・2026-08-15「下線は…デザインとしてノイズ」）。
              // ここは文中リンクではなく**完了画面の行き先の一覧**（ul の項目）なので、
              // 色 + hover の濃さで足りる。**文中に埋まったリンクなら下線を残す**
              // （色だけが手掛かりになると WCAG 1.4.1 に触れる）。
              // 🚨 `hover:` を書いたら `active:` も書く（堀池・2026-08-15）。
              // **実測（2026-08-16・この要素で）**:
              //   SP（hover:none / pointer:coarse で描かせた）… :hover → **色が変わらない**
              //                                                :active → 変わる
              //   PC（hover:hover / pointer:fine）           … :hover → 変わる / :active → 変わる
              //   ＝ **active: が無ければ、スマホでは押しても何も変わらない**。
              // 🚨 幅だけ 390 にしても `(hover: hover)` は true のままなので、
              //    **幅を変えただけの計測では、この差は出ない**（それで一度測り損ねている）。
              className="text-primary hover:text-primary/80 active:text-primary/80"
            >
              {t("done_settings_link")}
            </Link>
          </li>
          <li className="text-muted-foreground">
            {t("done_tenant")} — {t("done_later")}
          </li>
          <li className="text-muted-foreground">
            {t("done_sso")} — {t("done_later")}
          </li>
          <li className="text-muted-foreground">
            {t("done_storage")} — {t("done_later")}
          </li>
        </ul>
        <Button
          type="button"
          className="min-h-(--control-h) w-full md:min-h-0"
          onClick={() => {
            router.push("/admin");
            router.refresh();
          }}
        >
          {t("go_admin")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {step === "password" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (event.currentTarget.reportValidity()) {
              setStep("details");
            }
          }}
          className="flex flex-col gap-4"
        >
          <p className="text-xs text-muted-foreground">{t("step_password_progress")}</p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-password">{t("new_password_label")}</Label>
            {/* 入口サイズ（--control-h-entry）を使う段。規約は globals.css:96-97
                （「入口の画面＝操作が1つだけの画面」専用）。
                🚨 以前ここは globals.css:100 を指していたが、**100 行目は別の話**
                （--control-h-xs＝言語切替 24px の例外）。2026-08-15 の実測で判明。
                🚨 **未決**: 規約の語が割れている。globals.css:96 と input.tsx:17 は「操作が1つ」、
                ここは "one operation" と "one control" を同じ文で使っていた。
                この段を実測すると form 内の操作できる要素は **3 個**
                （パスワード欄 / 表示切替 / 次へ）。「操作」なら1、「control」なら3。
                記録 2026-08-15 ／ 決める人: design・司令塔 ／
                何を決めるか: 数える単位を「操作」と「control」のどちらにするか。
                （測ったのは onboard。判定はしていない） */}
            <InputGroup className="h-(--control-h-entry) md:h-(--control-h-entry)">
              <InputGroupInput
                id="new-password"
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="px-4"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? t("hide_password") : t("show_password")}
                >
                  {showPassword ? (
                    <EyeOffIcon className="size-4" />
                  ) : (
                    <EyeIcon className="size-4" />
                  )}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <p className="text-xs text-muted-foreground">{t("new_password_help")}</p>
            {/* 🚨 赤い警告にしない。すぐ下に入力欄があり、これから普通に決めてもらう場面なので
                「何かがおかしい」の色は強すぎる（design 指摘）。完了画面では stage で消える。 */}
            {usingDefaultPassword ? (
              <p className="text-xs text-muted-foreground">{t("new_password_default_note")}</p>
            ) : null}
          </div>
          <Button type="submit" size="entry">
            {t("step_next")}
          </Button>
        </form>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit.run(true);
          }}
          className="flex flex-col gap-4"
        >
          <p className="text-xs text-muted-foreground">{t("step_details_progress")}</p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-name">{t("project_name_label")}</Label>
            <Input
              id="project-name"
              type="text"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              autoComplete="organization"
              className="h-(--control-h) md:h-(--control-h-pc)"
            />
            <p className="text-xs text-muted-foreground">{t("project_name_help")}</p>
          </div>
          <hr className="border-0 border-t border-border" />
          <div className="flex flex-col gap-4">
            <p className="text-sm font-medium text-muted-foreground">{t("optional_heading")}</p>
            <div className="flex flex-col gap-2">
              <p id="onboarding-logo-label" className="text-sm font-medium">{t("logo_label")}</p>
              {/* 選んだものの見せ方（サムネ・題名）は FileDropzone に任せる。
                  ここで img を出すと Attachment と二重になる。 */}
              {/* 受けるのはロゴ1枚なので、器もロゴの大きさに寄せる（原典 L94）。
                  寸法は FileDropzone 側が持つ（min-h-20 / max-w-64）。ここで px を書かない。 */}
              <FileDropzone
                name="logo"
                size="logo"
                labelledBy="onboarding-logo-label"
                onSelect={uploadLogo.run}
              />
              {logoUploading ? (
                <p className="text-xs text-muted-foreground">{t("logo_uploading")}</p>
              ) : null}
              {logoError ? <p className="text-sm text-destructive">{logoError}</p> : null}
              <p className="text-xs text-muted-foreground">{t("logo_help")}</p>
            </div>
          </div>
          <hr className="border-0 border-t border-border" />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex flex-col gap-2">
            <Button
              type="submit"
              className="w-full"
              loading={submit.pending}
              disabled={logoUploading}
            >
              {submit.pending ? t("submit_pending") : t("submit")}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("password")}
                disabled={submit.pending}
              >
                {t("step_back")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void submit.run(false)}
                loading={submit.pending}
              >
                {submit.pending ? t("submit_pending") : t("submit_later")}
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
