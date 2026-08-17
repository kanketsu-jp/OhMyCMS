"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/admin/field-label";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { FormDraft } from "@/components/admin/form-draft";
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
  // 🚨 298 の備考「**マイグレーションに必要なテナントなど**の設定をききます」。
  //    2026-08-15 に `7b923d9` が**画面からだけ**外した項目（API は受け付けたまま＝ 400 の原因）。
  //    外した理由は「テナント名が不要」ではなく「**1 画面に 5 つ並べても、区切り線は段の仕事をしない**」
  //    だった（本人のコミット本文）。**段に分けたので、同じ理由では外れない。**
  const [tenantName, setTenantName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<"form" | "done">("form");

  // 🚨 **ロゴのアップロードは、この画面から外した**（223 / 298・2026-08-16）。
  //    ここに在った `uploadLogo` の知見のうち、**失われると困るもの**を残す:
  //    ・inFlight を開けているのは**フックの側**（`hooks/use-submit-once.ts` の `run()` の try/finally）。
  //      呼び出し側に finally が無くても通る（**3 回押して 3 回とも走った**・2026-08-15 実測）。
  //    ・アップロード中は送信ボタンを塞いでいたが、**そこには守り手が無かった**
  //      （戻し損ねると「はじめる」が二度と押せず、初期設定を終えられない形）。
  //    🚨 **戻すときは、この 2 つを読んでから戻すこと。**
  //
  // 🚨 **`keyOf` は渡さない。渡すと壊れる。**
  //    `check-submit-once.mjs` の「行ごとの操作で keyOf を忘れている疑い」に**毎回出る**が、
  //    ここは**誤検出**（引数つきで呼んでいるだけで、行ごとの操作ではない）。
  //
  //    「はじめる」と「あとで」は**同じ初期設定を送る 2 つのボタン**なので、
  //    **片方が実行中は、もう片方も落ちるのが正しい**。鍵を分けると両方走る。
  //
  //    実測（2026-08-16・Storybook。fetch を 1.5 秒かかる形にして実行中の窓を作った）:
  //      「はじめる」を押した直後に「あとで」を押す
  //      → **走った本数 1**（内訳: 詳細つき）＝ **2 本目は落ちた。これが正しい**
  //    記録 2026-08-16 ／ 決めた人: onboard(w4A:p2A) ／ 状態: **決定済み（keyOf は不要）**
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
              tenant_name: tenantName,
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
            <FieldLabel htmlFor="new-password" required>{t("new_password_label")}</FieldLabel>
            {/* 入口サイズ（--control-h-entry）を使う段。規約は `globals.css` の `--control-h-entry` の宣言（とその直前のコメント）
                （「入口の画面＝操作が1つだけの画面」専用）。
                🚨 以前ここは `globals.css` の**別の行**を指していたが、そこは別の話
                （--control-h-xs＝言語切替 24px の例外）。2026-08-15 の実測で判明。
                🚨 **未決**: 規約の語が割れている。`globals.css` の `--control-h-entry` と `components/ui/input.tsx` の 56px の説明は「操作が1つ」、
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
          id="onboarding-details-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit.run(true);
          }}
          className="flex flex-col gap-4"
        >
          {/* 🚨 299 A「続きから」（堀池さん・2026-08-16）。**新しく作らず `FormDraft` に乗る**
              （12 画面で既に使われている）。
              🚨 **管理者コードは、ここには入りません**——`FormDraft` は
              `SECRET_FIELD_PATTERN = /password|secret|token|key/i` で **name / id を見て弾く**ので、
              `id="new-password"` が当たります。**それが 299 の案 A（秘密は残さない）**。
              🚨🚨 **だから欄の `id` から `password` を外さないこと。**
              298 は表示を「管理者コード」にせよと言っているが、**表示だけ**変える。
              `id="admin-code"` にした瞬間、**除外の網から外れて localStorage に書かれます**
              （実測: `/password|secret|token|key/i` は `admin-code` に当たらない）。
              ＝ **規則が欄の名前に依存している**。名前を変えると、守りが**黙って**外れる。 */}
          <FormDraft formId="onboarding-details-form" />
          <p className="text-xs text-muted-foreground">{t("step_details_progress")}</p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-name">{t("project_name_label")}</Label>
            <Input
              id="project-name"
              name="project-name"
              type="text"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              autoComplete="organization"
              className="h-(--control-h) md:h-(--control-h-pc)"
            />
            <p className="text-xs text-muted-foreground">{t("project_name_help")}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tenant-name">{t("tenant_name_label")}</Label>
            <Input
              id="tenant-name"
              name="tenant-name"
              type="text"
              value={tenantName}
              onChange={(event) => setTenantName(event.target.value)}
              className="h-(--control-h) md:h-(--control-h-pc)"
            />
            <p className="text-xs text-muted-foreground">{t("tenant_name_help")}</p>
          </div>
          {/* 🚨 ロゴはここに置かない（298・司令塔 2026-08-16）。
              原文は「**マイグレーションに必要な**テナントなどの設定をききます」で、
              **システムが要求するものだけ**を聞く形。ロゴは後から設定画面で決められる。
              🚨 区切り線（<hr>）も一緒に外した。**段に分けたので、線で話題を割る必要が無い**
              ——線が段の仕事をしていたのが `7b923d9` が 5 つを 1 つに減らした理由だった。 */}
          <hr className="border-0 border-t border-border" />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex flex-col gap-2">
            <Button
              type="submit"
              className="w-full"
              loading={submit.pending}
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
