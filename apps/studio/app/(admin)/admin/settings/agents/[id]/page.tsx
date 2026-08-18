import Link from "next/link";

import { ErrorBanner } from "@/components/admin/error-banner";
import { Surface, SurfaceTitle } from "@/components/ui/surface";
import { getFormat, getT } from "@/i18n/server";
import { apiFetch } from "@/lib/admin/api";

/**
 * エージェントの **1 件**のページ。
 *
 * 🚨 **なぜ作ったか**（`decisions/list-views-are-switchable-layouts` §3）:
 *    各領域は「一覧 / 1 件 / 新規」の 3 つに揃える、と決めた。
 *    【測った・2026-08-17】`settings/agents` は **一覧しか無かった**。
 *
 * 🚨 **ここは他より価値が高い。** 2026-08-17 に **失効し損ねたエージェントが 8 体**見つかった
 *    （うち **管理者権限がまだ有効なものが 1 体**）。
 *    ＝ **「いつ切れるか」「もう失効しているか」を 1 件ずつ確かめる場所**が要る。
 *
 * 🚨 **鍵（token）は出さない。** 発行時の 1 回しか出さない設計で、ここには無い。
 *    「見えないこと」を画面に書いておく——**探させないため**。
 */

type Props = {
  params: Promise<{ id: string }>;
};

type AgentRow = {
  id: string;
  name: string;
  origin: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  /** 🚨 期限切れかどうかは **DB が判定した値**。画面で時刻を読まない。 */
  is_expired: boolean;
};

export default async function AgentDetailPage({ params }: Props) {
  const { id } = await params;
  const t = await getT("agents");
  const tError = await getT("errors");
  const format = await getFormat();

  const result = await apiFetch<{ data: AgentRow }>(`/api/auth/agents/${id}`);
  const agent = result.ok ? result.data.data : null;

  /**
   * 🚨 **「失効した」と「期限が切れた」を分ける。**
   *    どちらも「もう使えない」だが、**直し方が違う**
   *    （失効＝人が止めた／期限切れ＝放っておいた）。
   *    2026-08-17 の 8 体は **6 体が期限切れ・2 体がまだ有効**で、**扱いが分かれた**。
   */
  /**
   * 🚨 **いまの時刻を画面で読まない。** `Date.now()` は描くたびに違う答えを返すので、
   *    **同じ入力から同じ画面が出ない**（lint も `Cannot call impure function during render` で止める）。
   *    ＝ 🚨 **「描画の外へ移す」では足りない。呼ばないのが正しい。**
   *
   *    代わりに **DB が判定した値**（`is_expired`）を使う。
   *    ＝ **時計は 1 つ**になり、一覧と 1 件で答えが食い違わない。
   */
  const state: "revoked" | "expired" | "active" =
    agent === null ? "active" : agent.revoked_at !== null ? "revoked" : agent.is_expired ? "expired" : "active";

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link
          href="/admin/settings/agents"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t("back_to_list")}
        </Link>
      </div>
      <ErrorBanner message={!result.ok ? tError(result.messageKey) : null} />
      {agent ? (
        <Surface>
          <SurfaceTitle>{agent.name}</SurfaceTitle>
          <dl className="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted-foreground">{t("state_label")}</dt>
            <dd>{t(`state_${state}`)}</dd>
            <dt className="text-muted-foreground">{t("created_at_label")}</dt>
            <dd>{format.dateTime(new Date(agent.created_at))}</dd>
            <dt className="text-muted-foreground">{t("expires_at_label")}</dt>
            <dd>{format.dateTime(new Date(agent.expires_at))}</dd>
            <dt className="text-muted-foreground">{t("revoked_at_label")}</dt>
            {/* 🚨 失効していないことを空欄にしない。「していません」と書く。 */}
            <dd>
              {agent.revoked_at === null
                ? t("not_revoked")
                : format.dateTime(new Date(agent.revoked_at))}
            </dd>
            <dt className="text-muted-foreground">{t("origin_label")}</dt>
            <dd>{agent.origin ?? t("no_origin")}</dd>
          </dl>
          {/* 🚨 **見えないものを、見えないと書く。** 探させない。 */}
        <p className="mt-4 text-base text-muted-foreground">{t("detail_no_token_note")}</p>
        </Surface>
      ) : null}
    </div>
  );
}
